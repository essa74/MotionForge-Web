# MotionForge Backend

Initial FastAPI service scaffold for the hybrid MotionForge architecture.

## Local setup

1. Create a Python virtual environment.
2. Install dependencies: `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` to a PostgreSQL database you control.
4. Start the API from this directory: `uvicorn app.main:app --reload`.
5. Open `/health` or `/docs` to verify the service.

The first milestone is the API foundation only. Authentication, user/project persistence, Google Drive backup, render workers, and production deployment are not connected yet. Never commit real credentials or OAuth secrets.
