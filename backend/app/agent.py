from __future__ import annotations

import ast
import hashlib
import json
import os
import shutil
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



class VideoPlanRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    duration_seconds: int = Field(default=7, ge=1, le=600)
    width: int = Field(default=1920, ge=240, le=3840)
    height: int = Field(default=1080, ge=240, le=3840)
    fps: int = Field(default=30, ge=12, le=60)
    style: str = Field(default="cinematic", max_length=80)


@router.post("/workspaces/{workspace_id}/plans/video")
async def create_video_plan(
    workspace_id: str,
    payload: VideoPlanRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _require_user(request, authorization)
    root = _workspace(user_id, workspace_id)
    plan_id = str(uuid.uuid4())
    phases = [
        {
            "id": "inspect_assets",
            "title": "فحص الأصول",
            "description": "حصر الصور والشعار والصوت والتأكد من صيغها وأبعادها ومددها.",
            "status": "pending",
            "requires": ["workspace_files"],
        },
        {
            "id": "production_design",
            "title": "تصميم خطة الإنتاج",
            "description": "إعداد التسلسل الزمني والمشاهد والحركة والتعليق والمؤثرات.",
            "status": "pending",
            "requires": ["asset_report"],
        },
        {
            "id": "build_remotion",
            "title": "بناء مشروع Remotion",
            "description": "إنشاء ملفات المشروع والمكونات والـ Composition وربط الأصول.",
            "status": "pending",
            "requires": ["production_design"],
        },
        {
            "id": "validate_project",
            "title": "فحص المشروع",
            "description": "التحقق من الملفات والاعتمادات وإعدادات الفيديو قبل الرندر.",
            "status": "pending",
            "requires": ["build_remotion"],
        },
        {
            "id": "render_preview",
            "title": "رندر معاينة",
            "description": "إنتاج نسخة معاينة قصيرة أو إطارات اختبار.",
            "status": "pending",
            "requires": ["validate_project"],
        },
        {
            "id": "quality_review",
            "title": "مراجعة الجودة",
            "description": "فحص الإطارات والصوت والتوقيت والتكوين البصري.",
            "status": "pending",
            "requires": ["render_preview"],
        },
        {
            "id": "render_final",
            "title": "الرندر النهائي",
            "description": "إنتاج ملف MP4 بالمقاس ومعدل الإطارات المحددين.",
            "status": "pending",
            "requires": ["quality_review"],
        },
        {
            "id": "verify_export",
            "title": "التحقق والتسليم",
            "description": "التحقق من سلامة ملف MP4 ومدة الفيديو وحجمه وتجهيزه للتنزيل.",
            "status": "pending",
            "requires": ["render_final"],
        },
    ]
    plan = {
        "id": plan_id,
        "kind": "video",
        "title": payload.title,
        "status": "planned",
        "settings": {
            "duration_seconds": payload.duration_seconds,
            "width": payload.width,
            "height": payload.height,
            "fps": payload.fps,
            "style": payload.style,
        },
        "total_frames": payload.duration_seconds * payload.fps,
        "phases": phases,
        "execution_enabled": False,
        "note": "هذه خطة إنتاج منظمة. تنفيذ أوامر النظام والرندر غير مفعّل في هذه المرحلة.",
    }
    plans_dir = root / "plans"
    plans_dir.mkdir(exist_ok=True)
    (plans_dir / f"{plan_id}.json").write_text(
        json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return plan


@router.get("/workspaces/{workspace_id}/plans/{plan_id}")
async def get_video_plan(
    workspace_id: str,
    plan_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    user_id = _require_user(request, authorization)
    root = _workspace(user_id, workspace_id)
    try:
        safe_plan_id = str(uuid.UUID(plan_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="خطة الإنتاج غير موجودة.") from None
    plan_file = root / "plans" / f"{safe_plan_id}.json"
    if not plan_file.is_file():
        raise HTTPException(status_code=404, detail="خطة الإنتاج غير موجودة.")
    return json.loads(plan_file.read_text(encoding="utf-8"))



class RemotionScaffoldRequest(BaseModel):
    project_name: str = Field(default="EssaStudioVideo", min_length=1, max_length=80)
    composition_id: str = Field(default="EssaStudioIntro", min_length=1, max_length=80)
    title: str = Field(default="Your Story Starts Here", min_length=1, max_length=100)
    duration_seconds: int = Field(default=7, ge=1, le=600)
    width: int = Field(default=1920, ge=240, le=3840)
    height: int = Field(default=1080, ge=240, le=3840)
    fps: int = Field(default=30, ge=12, le=60)
    overwrite: bool = False


@router.post("/workspaces/{workspace_id}/scaffold/remotion")
async def scaffold_remotion_project(
    workspace_id: str,
    payload: RemotionScaffoldRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    """Create a ready-to-install Remotion starter project; no shell commands are run."""
    import re

    user_id = _require_user(request, authorization)
    root = _workspace(user_id, workspace_id)
    project_dir = _safe_file_path(root, "remotion")
    if project_dir.exists() and any(project_dir.iterdir()) and not payload.overwrite:
        raise HTTPException(status_code=409, detail="يوجد مشروع Remotion بالفعل. فعّل overwrite لاستبدال ملفاته.")

    safe_project_name = re.sub(r"[^A-Za-z0-9_-]", "-", payload.project_name).strip("-_") or "EssaStudioVideo"
    safe_composition_id = re.sub(r"[^A-Za-z0-9_-]", "", payload.composition_id) or "EssaStudioIntro"
    total_frames = payload.duration_seconds * payload.fps

    files = {
        "package.json": {
            "name": safe_project_name.lower(),
            "version": "1.0.0",
            "private": True,
            "scripts": {
                "dev": "remotion studio src/index.ts",
                "render": "remotion render src/index.ts " + safe_composition_id + " out/video.mp4",
                "still": "remotion still src/index.ts " + safe_composition_id + " out/frame.png --frame=0"
            },
            "dependencies": {
                "@remotion/cli": "^4.0.0",
                "remotion": "^4.0.0",
                "react": "^18.2.0",
                "react-dom": "^18.2.0"
            },
            "devDependencies": {"@types/react": "^18.2.0", "typescript": "^5.4.0"}
        },
        "tsconfig.json": {
            "compilerOptions": {
                "target": "ES2020",
                "lib": ["DOM", "DOM.Iterable", "ES2020"],
                "jsx": "react-jsx",
                "module": "ESNext",
                "moduleResolution": "Bundler",
                "strict": True,
                "skipLibCheck": True,
                "esModuleInterop": True,
                "noEmit": True
            },
            "include": ["src"]
        },
        "src/index.ts": """import { registerRoot } from 'remotion';
import { Root } from './Root';

registerRoot(Root);
""",
        "src/Root.tsx": f"""import React from 'react';
import {{ Composition }} from 'remotion';
import {{ LogoAnimation }} from './LogoAnimation';

export const Root: React.FC = () => (
  <Composition
    id={{{json.dumps(safe_composition_id)}}}
    component={{LogoAnimation}}
    durationInFrames={{{total_frames}}}
    fps={{{payload.fps}}}
    width={{{payload.width}}}
    height={{{payload.height}}}
    defaultProps={{title: {json.dumps(payload.title, ensure_ascii=False)}}}
  />
);
""",
        "src/LogoAnimation.tsx": """import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

type Props = {title: string};

export const LogoAnimation: React.FC<Props> = ({title}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const entrance = spring({frame, fps, config: {damping: 16, stiffness: 90, mass: 0.8}});
  const fade = interpolate(frame, [0, 12, 150], [0, 1, 1], {extrapolateRight: 'clamp'});
  const drift = interpolate(frame, [0, 210], [36, -24], {extrapolateRight: 'clamp'});
  const scale = interpolate(entrance, [0, 1], [0.82, 1]);
  const titleSize = Math.min(width * 0.075, height * 0.15);

  return (
    <AbsoluteFill style={{
      background: 'radial-gradient(ellipse at 50% 42%, #243a60 0%, #101a31 42%, #070b14 100%)',
      color: '#ffffff', justifyContent: 'center', alignItems: 'center',
      fontFamily: 'Arial, sans-serif', overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute', width: height * 0.72, height: height * 0.72,
        borderRadius: '50%', border: '1px solid rgba(117,190,255,0.24)',
        transform: 'translateY(' + drift + 'px) scale(' + scale + ')', opacity: fade * 0.8,
        boxShadow: '0 0 90px rgba(64,145,255,0.16), inset 0 0 80px rgba(64,145,255,0.08)'
      }} />
      <div style={{
        width: height * 0.19, height: height * 0.19, borderRadius: height * 0.055,
        background: 'linear-gradient(135deg, #8bd8ff, #4778ff 55%, #9b72ff)',
        transform: 'scale(' + scale + ') rotate(' + ((1 - entrance) * -18) + 'deg)',
        opacity: fade, boxShadow: '0 18px 70px rgba(68,135,255,0.42)',
        marginBottom: height * 0.055
      }} />
      <div style={{
        fontSize: titleSize, fontWeight: 800, letterSpacing: '-0.04em',
        textAlign: 'center', padding: '0 8%', opacity: fade,
        transform: 'translateY(' + ((1 - entrance) * 34) + 'px) scale(' + scale + ')'
      }}>{title}</div>
      <div style={{
        position: 'absolute', bottom: height * 0.105, width: width * 0.16,
        height: 3, borderRadius: 99, background: 'linear-gradient(90deg, transparent, #83cfff, transparent)',
        transform: 'scaleX(' + interpolate(frame, [8, 35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) + ')',
        opacity: fade
      }} />
    </AbsoluteFill>
  );
};
""",
        "README.md": f"""# {safe_project_name}

مشروع Remotion مبدئي تم إنشاؤه بواسطة EssaStudio AI.

## مواصفات الفيديو
- Composition: {safe_composition_id}
- المدة: {payload.duration_seconds} ثانية ({total_frames} إطار)
- المقاس: {payload.width} × {payload.height}
- Frame rate: {payload.fps} fps

## التشغيل على جهاز يحتوي Node.js
1. ثبّت Node.js إصدار LTS.
2. نفّذ `npm install`.
3. للمعاينة: `npm run dev`.
4. للرندر: `npm run render`.

هذا القالب لا يشغّل أوامر على الخادم تلقائيًا. يجب تشغيله داخل بيئة تنفيذ معزولة ومصرح بها.
"""
    }

    project_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for relative, content in files.items():
        target = _safe_file_path(root, "remotion/" + relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        serialized = json.dumps(content, ensure_ascii=False, indent=2) if isinstance(content, dict) else content
        encoded = serialized.encode("utf-8")
        if len(encoded) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail=f"الملف {relative} أكبر من الحد المسموح.")
        if target.exists() and not payload.overwrite:
            raise HTTPException(status_code=409, detail=f"الملف {relative} موجود بالفعل.")
        temp = target.with_name(target.name + ".tmp")
        temp.write_bytes(encoded)
        temp.replace(target)
        written.append({"path": "remotion/" + relative, "bytes": len(encoded)})

    return {
        "created": True,
        "project_path": "remotion/",
        "composition_id": safe_composition_id,
        "duration_frames": total_frames,
        "files": written,
        "next_step": "راجع الملفات ثم ثبّت الاعتمادات وشغّل Remotion داخل Worker معزول. لم يتم تشغيل npm أو الرندر على خادم API."
    }



@router.post("/workspaces/{workspace_id}/remotion/preflight")
async def remotion_preflight(
    workspace_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    """Static project checks plus runtime discovery; never executes project code."""
    user_id = _require_user(request, authorization)
    root = _workspace(user_id, workspace_id)
    project = _safe_file_path(root, "remotion")
    if not project.is_dir():
        raise HTTPException(status_code=404, detail="مشروع Remotion غير موجود.")

    checks = []
    required = [
        "package.json", "tsconfig.json", "src/index.ts",
        "src/Root.tsx", "src/LogoAnimation.tsx", "README.md",
    ]
    for relative in required:
        item = _safe_file_path(root, "remotion/" + relative)
        checks.append({
            "name": "وجود " + relative,
            "passed": item.is_file(),
        })

    package = {}
    package_path = _safe_file_path(root, "remotion/package.json")
    if package_path.is_file():
        try:
            package = json.loads(package_path.read_text(encoding="utf-8"))
            checks.append({"name": "package.json صالح", "passed": isinstance(package, dict)})
        except (json.JSONDecodeError, UnicodeDecodeError):
            checks.append({"name": "package.json صالح", "passed": False})
            package = {}

    dependencies = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
    scripts = package.get("scripts", {})
    checks.extend([
        {"name": "اعتماد Remotion موجود", "passed": "remotion" in dependencies},
        {"name": "واجهة Remotion CLI موجودة", "passed": "@remotion/cli" in dependencies},
        {"name": "أمر الرندر معرف", "passed": "render" in scripts},
    ])

    source_checks = [
        ("src/index.ts", "registerRoot"),
        ("src/Root.tsx", "Composition"),
        ("src/LogoAnimation.tsx", "useCurrentFrame"),
    ]
    for relative, marker in source_checks:
        item = _safe_file_path(root, "remotion/" + relative)
        content = item.read_text(encoding="utf-8") if item.is_file() else ""
        checks.append({"name": relative + " يحتوي " + marker, "passed": marker in content})

    runtime = {
        "python": shutil.which("python") or shutil.which("python3"),
        "node": shutil.which("node"),
        "npm": shutil.which("npm"),
        "ffmpeg": shutil.which("ffmpeg"),
    }
    passed = sum(1 for check in checks if check["passed"])
    return {
        "workspace_id": workspace_id,
        "project_path": "remotion/",
        "checks_passed": passed,
        "checks_total": len(checks),
        "checks_failed": len(checks) - passed,
        "checks": checks,
        "runtime": runtime,
        "can_render_here": bool(runtime["node"] and runtime["npm"] and runtime["ffmpeg"]),
        "execution_performed": False,
        "note": "الفحص ساكن فقط؛ لم يتم تشغيل npm أو أي كود من المشروع. إذا غابت أدوات Node أو FFmpeg نحتاج Worker منفصل للرندر.",
    }
