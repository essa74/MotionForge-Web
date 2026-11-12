from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.auth import router as auth_router
from app.chat import router as chat_router
from app.config import settings
from app.db import engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title=settings.app_name, version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
if settings.session_secret:
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        same_site="none" if settings.app_env == "production" else "lax",
        https_only=settings.app_env == "production",
        session_cookie="essastudio_session",
        max_age=60 * 60 * 24 * 14,
    )

app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(chat_router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "essastudio-api"}


@app.get(f"{settings.api_v1_prefix}/system/info", tags=["system"])
async def system_info() -> dict[str, str]:
    return {"name": settings.app_name, "version": "0.2.0", "environment": settings.app_env}
