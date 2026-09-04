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

`/docs` is the full interactive schema (everything, including admin/internal endpoints).
`/partner-docs` is the same, filtered down to what an external integration partner
would actually use — see [../API_DOCUMENTATION.md](../API_DOCUMENTATION.md) for the
written guide that goes with it. Adding a new router: give it a real `tags=[...]` and
add a matching entry to `OPENAPI_TAGS` in `app/main.py` so it gets a description in both
docs pages; if it's admin/staff-only, keep it under an `/api/v1/admin/...` (or
`.../front-desk`) path so it's automatically excluded from `/partner-docs`.

## Tests

```bash
python -m pytest -q
```

## Migrations

```bash
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

## Deployment

**Production runs on Dokploy** (a self-hosted PaaS on the project's own VPS), at
`https://ovigo-api.salmandev.io`. `.github/workflows/deploy-dokploy.yml` auto-deploys on
every push to `main` that touches `backend/**`, via Dokploy's own REST API (the API key
is a GitHub Actions secret, `DOKPLOY_API_KEY` — never committed). Set `DATABASE_URL`,
`SYNC_DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`, and `ELASTICSEARCH_URL` as
environment variables on the Dokploy application itself — do not commit real secrets to
`.env`. See `PROGRESS_TRACKER.md`'s "Infrastructure note" section for the full migration
history and why.

FastAPI Cloud (`fastapi deploy`) is also still wired up but currently idle — kept as a
fallback, not actively used for production traffic.

## Module layout

Each domain lives under `app/modules/<name>/` with `models.py`, `schemas.py`, `service.py`, `router.py`.
Shared auth/permission/db plumbing lives in `app/core/` and `app/database.py`. New modules are added
sprint-by-sprint per the phase plan — see `PROGRESS_TRACKER.md` at the repo root for current status.
