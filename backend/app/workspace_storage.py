from __future__ import annotations

import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import _authenticated_user_id
from app.db import get_db
from app.models import AgentWorkspace, AgentWorkspaceFile

router = APIRouter(prefix="/storage", tags=["Persistent workspace storage"])
MAX_FILE_BYTES = 1_000_000
MAX_FILES = 200


class WorkspaceCreate(BaseModel):
    name: str = Field(default="New project", min_length=1, max_length=100)


class FileWrite(BaseModel):
    path: str = Field(min_length=1, max_length=240)
    content: str = Field(max_length=1_000_000)


def _owner_id(request: Request, authorization: str | None) -> uuid.UUID:
    value = _authenticated_user_id(request, authorization)
    if not value:
        raise HTTPException(status_code=401, detail="سجّل الدخول أولاً.")
    try:
        return uuid.UUID(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="جلسة المستخدم غير صالحة.") from None


def _safe_path(value: str) -> str:
    pure = PurePosixPath(value.replace("\\", "/"))
    if pure.is_absolute() or not pure.parts or any(part in ("", ".", "..") for part in pure.parts):
        raise HTTPException(status_code=400, detail="مسار الملف غير صالح.")
    if any(part.startswith(".") for part in pure.parts):
        raise HTTPException(status_code=400, detail="المسارات المخفية غير مسموح بها.")
    normalized = pure.as_posix()
    if len(normalized.encode("utf-8")) > 240:
        raise HTTPException(status_code=400, detail="مسار الملف أطول من الحد المسموح.")
    return normalized


async def _owned_workspace(db: AsyncSession, owner_id: uuid.UUID, workspace_id: str) -> AgentWorkspace:
    try:
        parsed_id = uuid.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="مساحة العمل غير موجودة.") from None
    result = await db.execute(
        select(AgentWorkspace).where(
            AgentWorkspace.id == parsed_id,
            AgentWorkspace.owner_id == owner_id,
        )
    )
    workspace = result.scalar_one_or_none()
    if workspace is None:
        raise HTTPException(status_code=404, detail="مساحة العمل غير موجودة.")
    return workspace


@router.post("/workspaces", status_code=201)
async def create_workspace(
    payload: WorkspaceCreate,
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    owner_id = _owner_id(request, authorization)
    workspace = AgentWorkspace(owner_id=owner_id, name=payload.name)
    db.add(workspace)
    await db.commit()
    await db.refresh(workspace)
    return {
        "workspace_id": str(workspace.id),
        "name": workspace.name,
        "status": "ready",
        "storage": "database",
    }


@router.get("/workspaces")
async def list_workspaces(
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    owner_id = _owner_id(request, authorization)
    result = await db.execute(
        select(AgentWorkspace)
        .where(AgentWorkspace.owner_id == owner_id)
        .order_by(AgentWorkspace.updated_at.desc())
    )
    return {
        "workspaces": [
            {
                "workspace_id": str(item.id),
                "name": item.name,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            }
            for item in result.scalars().all()
        ]
    }


@router.get("/workspaces/{workspace_id}/files")
async def list_files(
    workspace_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    owner_id = _owner_id(request, authorization)
    workspace = await _owned_workspace(db, owner_id, workspace_id)
    result = await db.execute(
        select(AgentWorkspaceFile)
        .where(AgentWorkspaceFile.workspace_id == workspace.id)
        .order_by(AgentWorkspaceFile.path)
    )
    files = result.scalars().all()
    return {
        "workspace_id": str(workspace.id),
        "files": [{"path": item.path, "size": item.size_bytes} for item in files],
    }


@router.put("/workspaces/{workspace_id}/files")
async def write_file(
    workspace_id: str,
    payload: FileWrite,
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    owner_id = _owner_id(request, authorization)
    workspace = await _owned_workspace(db, owner_id, workspace_id)
    path = _safe_path(payload.path)
    size = len(payload.content.encode("utf-8"))
    if size > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="حجم الملف أكبر من 1 ميجابايت.")

    result = await db.execute(
        select(AgentWorkspaceFile).where(
            AgentWorkspaceFile.workspace_id == workspace.id,
            AgentWorkspaceFile.path == path,
        )
    )
    file_record = result.scalar_one_or_none()
    if file_record is None:
        count_result = await db.execute(
            select(func.count()).select_from(AgentWorkspaceFile).where(
                AgentWorkspaceFile.workspace_id == workspace.id
            )
        )
        if count_result.scalar_one() >= MAX_FILES:
            raise HTTPException(status_code=413, detail="وصل المشروع إلى الحد الأقصى وهو 200 ملف.")
        file_record = AgentWorkspaceFile(
            workspace_id=workspace.id,
            path=path,
            content=payload.content,
            size_bytes=size,
        )
        db.add(file_record)
    else:
        file_record.content = payload.content
        file_record.size_bytes = size
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="تعذر حفظ الملف بسبب تعارض. حاول مرة أخرى.") from None
    return {"saved": True, "path": path, "bytes": size, "storage": "database"}


@router.get("/workspaces/{workspace_id}/files/{file_path:path}")
async def read_file(
    workspace_id: str,
    file_path: str,
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    owner_id = _owner_id(request, authorization)
    workspace = await _owned_workspace(db, owner_id, workspace_id)
    path = _safe_path(file_path)
    result = await db.execute(
        select(AgentWorkspaceFile).where(
            AgentWorkspaceFile.workspace_id == workspace.id,
            AgentWorkspaceFile.path == path,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="الملف غير موجود.")
    return {"path": item.path, "content": item.content, "bytes": item.size_bytes}


@router.delete("/workspaces/{workspace_id}/files/{file_path:path}")
async def delete_file(
    workspace_id: str,
    file_path: str,
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    owner_id = _owner_id(request, authorization)
    workspace = await _owned_workspace(db, owner_id, workspace_id)
    path = _safe_path(file_path)
    result = await db.execute(
        select(AgentWorkspaceFile).where(
            AgentWorkspaceFile.workspace_id == workspace.id,
            AgentWorkspaceFile.path == path,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="الملف غير موجود.")
    await db.delete(item)
    await db.commit()
    return {"deleted": True, "path": path}
