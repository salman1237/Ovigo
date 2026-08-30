# Ovigo

Local Expert, Host & Stay Booking Platform.

- **Technical spec:** [OVIGO_TECHNICAL_DOCUMENT.md](OVIGO_TECHNICAL_DOCUMENT.md)
- **How we're building it:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- **Live sprint-by-sprint status:** [PROGRESS_TRACKER.md](PROGRESS_TRACKER.md)

## Stack

| Layer | Tech | Hosting |
|---|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 + Alembic | FastAPI Cloud |
| Frontend | Next.js 16 (App Router) + Tailwind v4 | Vercel |
| Database | PostgreSQL | NeonDB |

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
