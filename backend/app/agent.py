from __future__ import annotations

import ast
import hashlib
import json
import os
import uuid
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth import _authenticated_user_id

router = APIRouter(prefix="/agent", tags=["Agent workspace"])
MAX_FILE_BYTES = 1_000_000
MAX_FILES = 200
WORKSPACE_ROOT = Path(os.getenv("AGENT_WORKSPACE_ROOT", "/tmp/essa-studio-workspaces"))


class CreateWorkspaceRequest(BaseModel):
    name: str = Field(default="New project", min_length=1, max_length=100)


class WriteFileRequest(BaseModel):
    path: str = Field(min_length=1, max_length=240)
    content: str = Field(max_length=1_000_000)


def _user_root(user_id: str) -> Path:
    # Hash the account identifier so it is never exposed in filesystem paths.
    user_key = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    return WORKSPACE_ROOT / user_key


def _workspace(user_id: str, workspace_id: str) -> Path:
    try:
        safe_id = str(uuid.UUID(workspace_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="مساحة العمل غير موجودة.") from None
    root = _user_root(user_id) / safe_id
    if not root.is_dir():
        raise HTTPException(status_code=404, detail="مساحة العمل غير موجودة.")
    return root


def _safe_file_path(root: Path, relative_path: str) -> Path:
    pure = PurePosixPath(relative_path.replace("\\", "/"))
    if pure.is_absolute() or not pure.parts or any(part in ("", ".", "..") for part in pure.parts):
        raise HTTPException(status_code=400, detail="مسار الملف غير صالح.")
    if any(part.startswith(".") for part in pure.parts):
        raise HTTPException(status_code=400, detail="المسارات المخفية غير مسموح بها.")
    target = root.joinpath(*pure.parts)
    current = root
    for part in pure.parts[:-1]:
        current = current / part
        if current.is_symlink():
            raise HTTPException(status_code=400, detail="المسار غير مسموح به.")
    if target.is_symlink():
        raise HTTPException(status_code=400, detail="الروابط الرمزية غير مسموح بها.")
    if not target.resolve().is_relative_to(root.resolve()):
        raise HTTPException(status_code=400, detail="مسار الملف خارج مساحة العمل.")
    return target


def _require_user(request: Request, authorization: str | None) -> str:
    user_id = _authenticated_user_id(request, authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="سجّل الدخول أولاً.")
    return user_id


class _HTMLValidator(HTMLParser):
    pass


@router.post("/workspaces")
async def create_workspace(
    payload: CreateWorkspaceRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _require_user(request, authorization)
    workspace_id = str(uuid.uuid4())
    root = _user_root(user_id) / workspace_id
    root.mkdir(parents=True, exist_ok=False)
    metadata = {"id": workspace_id, "name": payload.name}
    (root / "workspace.json").write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
    return {"workspace_id": workspace_id, "name": payload.name, "status": "ready"}


@router.get("/workspaces/{workspace_id}/files")
async def list_workspace_files(
    workspace_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _require_user(request, authorization)
    root = _workspace(user_id, workspace_id)
    files = []
    for item in root.rglob("*"):
        if item.is_file() and not item.is_symlink() and item.name != "workspace.json":
            files.append({
                "path": item.relative_to(root).as_posix(),
                "size": item.stat().st_size,
            })
            if len(files) >= MAX_FILES:
                break
    return {"workspace_id": workspace_id, "files": files}


@router.put("/workspaces/{workspace_id}/files")
async def write_workspace_file(
    workspace_id: str,
    payload: WriteFileRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _require_user(request, authorization)
    root = _workspace(user_id, workspace_id)
    encoded = payload.content.encode("utf-8")
    if len(encoded) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="حجم الملف أكبر من الحد المسموح (1 ميجابايت).")
    target = _safe_file_path(root, payload.path)
    if not target.exists():
        existing_count = sum(1 for item in root.rglob("*") if item.is_file() and item.name != "workspace.json")
        if existing_count >= MAX_FILES:
            raise HTTPException(status_code=413, detail="وصل المشروع إلى الحد الأقصى لعدد الملفات.")
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(target.name + ".tmp")
    temp.write_bytes(encoded)
    temp.replace(target)
    return {"saved": True, "path": payload.path, "bytes": len(encoded)}


@router.get("/workspaces/{workspace_id}/files/{file_path:path}")
async def read_workspace_file(
    workspace_id: str,
    file_path: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _require_user(request, authorization)
    root = _workspace(user_id, workspace_id)
    target = _safe_file_path(root, file_path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="الملف غير موجود.")
    if target.stat().st_size > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="الملف أكبر من الحد المسموح للقراءة.")
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=415, detail="هذا الإصدار يدعم الملفات النصية فقط.") from None
    return {"path": file_path, "content": content}


@router.post("/workspaces/{workspace_id}/validate")
async def validate_workspace(
    workspace_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _require_user(request, authorization)
    root = _workspace(user_id, workspace_id)
    results = []
    for item in root.rglob("*"):
        if not item.is_file() or item.is_symlink() or item.name == "workspace.json":
            continue
        relative = item.relative_to(root).as_posix()
        if item.stat().st_size > MAX_FILE_BYTES:
            results.append({"path": relative, "valid": False, "message": "الملف أكبر من حد الفحص."})
            continue
        suffix = item.suffix.lower()
        try:
            if suffix == ".py":
                ast.parse(item.read_text(encoding="utf-8"), filename=relative)
            elif suffix == ".json":
                json.loads(item.read_text(encoding="utf-8"))
            elif suffix in (".html", ".htm"):
                parser = _HTMLValidator()
                parser.feed(item.read_text(encoding="utf-8"))
                parser.close()
            else:
                continue
            results.append({"path": relative, "valid": True, "message": "اجتاز الفحص الأساسي."})
        except (SyntaxError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            results.append({"path": relative, "valid": False, "message": str(exc)[:300]})
    return {
        "workspace_id": workspace_id,
        "checked": len(results),
        "passed": sum(1 for result in results if result["valid"]),
        "failed": sum(1 for result in results if not result["valid"]),
        "results": results,
    }
