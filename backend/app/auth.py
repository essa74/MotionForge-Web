from datetime import datetime, timezone
from uuid import UUID

from authlib.integrations.starlette_client import OAuth, OAuthError
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import GoogleCredential, User
from app.schemas import UserRead


router = APIRouter(prefix="/auth", tags=["authentication"])

oauth = OAuth()
if settings.google_client_id and settings.google_client_secret:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={
            "scope": "openid email profile https://www.googleapis.com/auth/drive.file",
            "code_challenge_method": "S256",
        },
    )


def _require_auth_configuration() -> None:
    missing = []
    if not settings.google_client_id:
        missing.append("GOOGLE_CLIENT_ID")
    if not settings.google_client_secret:
        missing.append("GOOGLE_CLIENT_SECRET")
    if not settings.session_secret:
        missing.append("SESSION_SECRET")
    if not settings.token_encryption_key:
        missing.append("TOKEN_ENCRYPTION_KEY")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Authentication is not configured. Missing: {', '.join(missing)}",
        )


def _cipher() -> Fernet:
    try:
        return Fernet(settings.token_encryption_key.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TOKEN_ENCRYPTION_KEY must be a valid Fernet key.",
        ) from None


@router.get("/google", name="google_login")
async def google_login(request: Request):
    _require_auth_configuration()
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )


@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    _require_auth_configuration()
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse(f"{settings.frontend_url.rstrip('/')}/?auth=error", status_code=303)

    userinfo = token.get("userinfo")
    if not userinfo:
        response = await oauth.google.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            token=token,
        )
        userinfo = response.json()

    google_sub = userinfo.get("sub")
    email = userinfo.get("email")
    if not google_sub or not email or not userinfo.get("email_verified", False):
        raise HTTPException(status_code=400, detail="Google did not return a verified account.")

    user_result = await db.execute(select(User).where(User.google_sub == google_sub))
    user = user_result.scalar_one_or_none()
    if user is None:
        user = User(
            google_sub=google_sub,
            email=email,
            display_name=userinfo.get("name"),
            avatar_url=userinfo.get("picture"),
        )
        db.add(user)
        await db.flush()
    else:
        user.email = email
        user.display_name = userinfo.get("name")
        user.avatar_url = userinfo.get("picture")

    credential_result = await db.execute(
        select(GoogleCredential).where(GoogleCredential.user_id == user.id)
    )
    credential = credential_result.scalar_one_or_none()
    cipher = _cipher()
    access_token = token.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Google did not return an access token.")

    expires_at = token.get("expires_at")
    expires_datetime = (
        datetime.fromtimestamp(float(expires_at), tz=timezone.utc)
        if expires_at is not None
        else None
    )
    refresh_token = token.get("refresh_token")

    if credential is None:
        credential = GoogleCredential(
            user_id=user.id,
            access_token_encrypted=cipher.encrypt(access_token.encode()).decode(),
            refresh_token_encrypted=(
                cipher.encrypt(refresh_token.encode()).decode() if refresh_token else None
            ),
            token_type=token.get("token_type", "Bearer"),
            scope=token.get("scope"),
            expires_at=expires_datetime,
        )
        db.add(credential)
    else:
        credential.access_token_encrypted = cipher.encrypt(access_token.encode()).decode()
        if refresh_token:
            credential.refresh_token_encrypted = cipher.encrypt(refresh_token.encode()).decode()
        credential.token_type = token.get("token_type", "Bearer")
        credential.scope = token.get("scope")
        credential.expires_at = expires_datetime

    await db.commit()
    request.session.clear()
    request.session["user_id"] = str(user.id)
    return RedirectResponse(f"{settings.frontend_url.rstrip('/')}/?auth=success", status_code=303)


@router.get("/me", response_model=UserRead)
async def current_user(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    try:
        parsed_id = UUID(user_id)
    except (TypeError, ValueError):
        request.session.clear()
        raise HTTPException(status_code=401, detail="Invalid session.") from None

    result = await db.execute(select(User).where(User.id == parsed_id))
    user = result.scalar_one_or_none()
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Session user not found.")
    return user


@router.get("/google/drive-status")
async def google_drive_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    try:
        parsed_id = UUID(user_id)
    except (TypeError, ValueError):
        request.session.clear()
        raise HTTPException(status_code=401, detail="Invalid session.") from None

    result = await db.execute(
        select(GoogleCredential).where(GoogleCredential.user_id == parsed_id)
    )
    credential = result.scalar_one_or_none()
    return {
        "connected": credential is not None,
        "drive_scope_granted": bool(
            credential and credential.scope and "drive.file" in credential.scope
        ),
    }


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged_out"}
