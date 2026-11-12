# EssaStudio AI Backend

FastAPI backend for EssaStudio AI. The current branch contains the first Google sign-in and Google Drive authorization foundation.

## Local setup

1. Create and activate a Python virtual environment.
2. Install dependencies: `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env`.
4. Set `DATABASE_URL` to a PostgreSQL database you control.
5. Apply the initial schema once using the SQL in `migrations/001_initial_schema.sql`.
6. Fill in the Google OAuth values described below.
7. Start the API from this directory: `uvicorn app.main:app --reload`.
8. Open `/health` and `/docs` to verify the API.

## Google OAuth configuration

Set these values in the backend environment only. Never put the client secret or encryption keys in React/Vite variables, commit them to Git, or send them in chat.

- `GOOGLE_CLIENT_ID`: OAuth client ID from Google Cloud.
- `GOOGLE_CLIENT_SECRET`: OAuth client secret from Google Cloud.
- `GOOGLE_REDIRECT_URI`: exact public backend callback URL. Local default: `http://localhost:8000/api/v1/auth/google/callback`.
- `FRONTEND_URL`: frontend origin to return to after authentication.
- `SESSION_SECRET`: long random secret used to sign the HttpOnly session cookie.
- `TOKEN_ENCRYPTION_KEY`: Fernet key used to encrypt Google access and refresh tokens at rest.

Generate secrets locally (do not paste generated secrets into GitHub):

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Use the first output for `SESSION_SECRET` and the second for `TOKEN_ENCRYPTION_KEY`.

## OAuth endpoints

- `GET /api/v1/auth/google`: start Google sign-in and request the least-privilege `drive.file` scope.
- `GET /api/v1/auth/google/callback`: validate the Google response, upsert the user, encrypt and store OAuth tokens, and establish the server-side session cookie.
- `GET /api/v1/auth/me`: return the signed-in user's profile.
- `GET /api/v1/auth/google/drive-status`: report whether Drive authorization is stored.
- `POST /api/v1/auth/logout`: clear the session.

The API does not return OAuth tokens to the browser. Refresh/access tokens are encrypted before database storage. The Drive file operations, automatic backup scheduler, token refresh worker, frontend login button, and production deployment are separate next milestones and are not claimed to be complete yet.

## Google Cloud

Keep the OAuth app in **Testing** while developing. Add the Google account used for testing under **Audience → Test users**. Add the exact value of `GOOGLE_REDIRECT_URI` under the OAuth client's **Authorized redirect URIs** after the backend's public address is known. Do not add arbitrary JavaScript origins; this server-side OAuth flow uses the redirect URI.

Never commit real credentials or OAuth secrets.
