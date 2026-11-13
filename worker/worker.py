from __future__ import annotations

import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "8081"))
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")
WORKSPACE_ROOT = Path(os.getenv("WORKER_WORKSPACE_ROOT", "/workspace")).resolve()
OUTPUT_ROOT = Path(os.getenv("WORKER_OUTPUT_ROOT", "/output")).resolve()
MAX_BODY = 8 * 1024 * 1024
MAX_PROJECT_FILES = 80
MAX_FILE_BYTES = 1_000_000
MAX_RENDER_SECONDS = 240
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


def safe_id(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError):
        raise ValueError("Invalid workspace id")


def authenticate(handler: BaseHTTPRequestHandler) -> bool:
    supplied = handler.headers.get("Authorization", "")
    expected = "Bearer " + WORKER_TOKEN
    return bool(WORKER_TOKEN) and hmac.compare_digest(supplied, expected)


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if length < 1 or length > MAX_BODY:
        raise ValueError("Request body size is invalid")
    raw = handler.rfile.read(length)
    value = json.loads(raw.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("JSON object required")
    return value


def write_json(handler: BaseHTTPRequestHandler, status: int, value: dict) -> None:
    body = json.dumps(value, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def safe_relative_path(raw: str) -> Path:
    if not isinstance(raw, str) or not raw or "\x00" in raw or "\\" in raw:
        raise ValueError("Invalid file path")
    path = Path(raw)
    if path.is_absolute() or any(part in ("", ".", "..") or part.startswith(".") for part in path.parts):
        raise ValueError("Unsafe file path")
    if len(path.parts) == 1 and path.name in ("package.json", "tsconfig.json", "README.md"):
        return path
    if path.parts[0] not in ("src", "public"):
        raise ValueError("Only project config files, src/ and public/ files are accepted")
    if path.suffix.lower() not in (".tsx", ".ts", ".jsx", ".js", ".json", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".mp3", ".wav", ".mp4"):
        raise ValueError("File extension is not allowed")
    return path


def run_job(job_id: str, payload: dict) -> None:
    job_dir = WORKSPACE_ROOT / job_id
    out_dir = OUTPUT_ROOT / job_id
    try:
        with LOCK:
            JOBS[job_id]["status"] = "installing"
            JOBS[job_id]["progress"] = 10

        if job_dir.exists():
            shutil.rmtree(job_dir)
        job_dir.mkdir(parents=True, exist_ok=False)
        out_dir.mkdir(parents=True, exist_ok=True)

        files = payload.get("files")
        if not isinstance(files, list) or not 1 <= len(files) <= MAX_PROJECT_FILES:
            raise ValueError("Project must contain 1 to 80 files")

        total_bytes = 0
        for item in files:
            if not isinstance(item, dict) or set(item.keys()) != {"path", "content"}:
                raise ValueError("Each file must contain path and content")
            relative = safe_relative_path(item["path"])
            content = item["content"]
            if not isinstance(content, str):
                raise ValueError("Only UTF-8 text files are currently accepted")
            encoded = content.encode("utf-8")
            if len(encoded) > MAX_FILE_BYTES:
                raise ValueError("A project file exceeds 1 MB")
            total_bytes += len(encoded)
            if total_bytes > 5_000_000:
                raise ValueError("Project exceeds 5 MB")
            target = (job_dir / relative).resolve()
            if not target.is_relative_to(job_dir.resolve()):
                raise ValueError("Path escaped workspace")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(encoded)

        required = ("package.json", "src/index.ts", "src/Root.tsx")
        for name in required:
            if not (job_dir / name).is_file():
                raise ValueError("Missing required file: " + name)

        package = json.loads((job_dir / "package.json").read_text(encoding="utf-8"))
        dependencies = package.get("dependencies", {})
        if not isinstance(dependencies, dict) or "remotion" not in dependencies or "@remotion/cli" not in dependencies:
            raise ValueError("Remotion and @remotion/cli must be declared dependencies")
        root_source = (job_dir / "src" / "Root.tsx").read_text(encoding="utf-8")
        composition_match = re.search(r'id=\{"([A-Za-z0-9_-]+)"\}', root_source)
        if not composition_match:
            raise ValueError("Could not identify a safe Remotion composition id")
        composition_id = composition_match.group(1)

        # The worker runs only its own fixed install and render commands.
        # Project code is still executable code: keep this service isolated,
        # without API secrets, and apply container CPU/memory limits at deploy time.
        with LOCK:
            JOBS[job_id]["status"] = "installing"
            JOBS[job_id]["progress"] = 25

        install = subprocess.run(
            ["npm", "install", "--no-audit", "--no-fund", "--ignore-scripts"],
            cwd=job_dir, capture_output=True, text=True, timeout=120, check=False,
            env={**os.environ, "CI": "1", "npm_config_audit": "false"},
        )
        if install.returncode != 0:
            raise RuntimeError(("npm install failed: " + install.stderr[-2500:])[:3000])

        with LOCK:
            JOBS[job_id]["status"] = "rendering"
            JOBS[job_id]["progress"] = 55

        output_file = out_dir / "video.mp4"
        render = subprocess.run(
            ["npx", "--no-install", "remotion", "render", "src/index.ts", composition_id,
             "out/video.mp4", "--codec=h264", "--log=error"],
            cwd=job_dir, capture_output=True, text=True,
            timeout=MAX_RENDER_SECONDS, check=False,
            env={**os.environ, "CI": "1"},
        )
        if render.returncode != 0:
            raise RuntimeError(("Remotion render failed: " + render.stderr[-2500:] + render.stdout[-1000:])[:3500])

        # The render script is required to target out/video.mp4.
        produced = job_dir / "out" / "video.mp4"
        if not produced.is_file() or produced.stat().st_size == 0:
            raise RuntimeError("Render completed but out/video.mp4 was not produced")
        shutil.copy2(produced, output_file)

        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration,size",
             "-of", "json", str(output_file)],
            capture_output=True, text=True, timeout=15, check=False,
        )
        if probe.returncode != 0:
            raise RuntimeError("FFprobe could not validate the MP4")
        metadata = json.loads(probe.stdout).get("format", {})
        with LOCK:
            JOBS[job_id].update({
                "status": "completed", "progress": 100,
                "output": f"/outputs/{job_id}/video.mp4",
                "size_bytes": output_file.stat().st_size,
                "duration_seconds": float(metadata.get("duration", 0)),
            })
    except Exception as exc:
        with LOCK:
            JOBS[job_id].update({"status": "failed", "error": str(exc)[:3500], "progress": 100})
    finally:
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            write_json(self, 200, {"status": "ok", "service": "essastudio-render-worker"})
            return
        if not authenticate(self):
            write_json(self, 401, {"detail": "Unauthorized"})
            return
        match = re.fullmatch(r"/jobs/([0-9a-f-]{36})", self.path)
        if match:
            with LOCK:
                job = JOBS.get(match.group(1))
                if job is None:
                    write_json(self, 404, {"detail": "Job not found"})
                else:
                    write_json(self, 200, job.copy())
            return
        output_match = re.fullmatch(r"/outputs/([0-9a-f-]{36})/video\.mp4", self.path)
        if output_match:
            output_path = (OUTPUT_ROOT / output_match.group(1) / "video.mp4").resolve()
            if not output_path.is_relative_to(OUTPUT_ROOT) or not output_path.is_file():
                write_json(self, 404, {"detail": "Output not found"})
                return
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(output_path.stat().st_size))
            self.send_header("Content-Disposition", 'attachment; filename="video.mp4"')
            self.end_headers()
            with output_path.open("rb") as video:
                shutil.copyfileobj(video, self.wfile)
            return
        write_json(self, 404, {"detail": "Not found"})

    def do_POST(self):
        if self.path != "/jobs":
            write_json(self, 404, {"detail": "Not found"})
            return
        if not authenticate(self):
            write_json(self, 401, {"detail": "Unauthorized"})
            return
        try:
            payload = read_json(self)
            job_id = safe_id(payload.get("workspace_id"))
            with LOCK:
                if len(JOBS) >= 20:
                    write_json(self, 429, {"detail": "Worker queue is full"})
                    return
                if any(job["status"] in ("queued", "installing", "rendering") for job in JOBS.values()):
                    write_json(self, 429, {"detail": "Worker is busy"})
                    return
                JOBS[job_id] = {"job_id": job_id, "status": "queued", "progress": 0}
            thread = threading.Thread(target=run_job, args=(job_id, payload), daemon=True)
            thread.start()
            write_json(self, 202, {"job_id": job_id, "status": "queued"})
        except (ValueError, json.JSONDecodeError) as exc:
            write_json(self, 400, {"detail": str(exc)})

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
