# Ovigo

Local Expert, Host & Stay Booking Platform.

- **Technical spec:** [OVIGO_TECHNICAL_DOCUMENT.md](OVIGO_TECHNICAL_DOCUMENT.md)
- **How we're building it:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- **Live sprint-by-sprint status:** [PROGRESS_TRACKER.md](PROGRESS_TRACKER.md)
- **External-partner API guide:** [API_DOCUMENTATION.md](API_DOCUMENTATION.md) — start here if you're integrating against the Ovigo API rather than working on this codebase. Interactive docs live at `/partner-docs` on the running API.

## Stack

| Layer | Tech | Hosting |
|---|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 + Alembic | Dokploy (self-hosted VPS) — production at `https://ovigo-api.salmandev.io`; FastAPI Cloud also exists but is currently idle, see PROGRESS_TRACKER.md's infrastructure note |
| Frontend | Next.js 16 (App Router) + Tailwind v4 | Vercel |
| Database | PostgreSQL | NeonDB |
| Search | Elasticsearch (self-hosted, same VPS) | — |

## Repo layout

```
backend/    FastAPI app — see backend/README.md
frontend/   Next.js app
```

## Getting started

See [backend/README.md](backend/README.md) and run the frontend with:

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
