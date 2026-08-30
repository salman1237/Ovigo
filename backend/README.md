# Ovigo API (backend)

FastAPI backend for the Ovigo marketplace. See [../OVIGO_TECHNICAL_DOCUMENT.md](../OVIGO_TECHNICAL_DOCUMENT.md)
and [../IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) for full context.

## Local development

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash; use .venv\Scripts\activate.bat for cmd
pip install -r requirements.txt
cp .env.example .env            # fill in DATABASE_URL / SYNC_DATABASE_URL / JWT_SECRET_KEY
alembic upgrade head
fastapi dev app/main.py         # http://127.0.0.1:8000, docs at /docs
```

## Tests

```bash
python -m pytest -q
```

## Migrations

```bash
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

## Deployment — FastAPI Cloud

```bash
fastapi deploy
```

Or connect this GitHub repo in the FastAPI Cloud dashboard (Import → root directory `backend`) for
auto-deploy on push to `main`. Set `DATABASE_URL`, `SYNC_DATABASE_URL`, `JWT_SECRET_KEY` and `CORS_ORIGINS`
as environment variables in the project settings — do not commit real secrets to `.env`.

## Module layout

Each domain lives under `app/modules/<name>/` with `models.py`, `schemas.py`, `service.py`, `router.py`.
Shared auth/permission/db plumbing lives in `app/core/` and `app/database.py`. New modules are added
sprint-by-sprint per the phase plan — see `PROGRESS_TRACKER.md` at the repo root for current status.
