# OVIGO — Implementation Plan

> Companion to [OVIGO_TECHNICAL_DOCUMENT.md](OVIGO_TECHNICAL_DOCUMENT.md). This file defines **how we execute**
> the technical document in practice: repo layout, environment/deploy setup, and the working rhythm for
> shipping phase by phase. Live status lives in [PROGRESS_TRACKER.md](PROGRESS_TRACKER.md) — update that file,
> not this one, as work completes.

## 1. Reality check on scope

The technical document scopes ~60 weeks of work across 4 phases for a dedicated team of 8-10
(3-4 backend, 2-3 frontend, DevOps, QA, PM, designer). Built solo/AI-assisted, this will take materially
longer in wall-clock terms even though the code volume is the same. To keep this tractable:

- We build **one sprint-sized slice at a time**, in the order the technical document lays out (Phase 1
  Sprint 1-2 → Sprint 3-4 → ... → Phase 2 → Phase 3 → Phase 4).
- Each slice ends with: working code, a migration if schema changed, a short manual smoke test, a commit,
  and a push to `main` (or a feature branch + PR if the user asks for review gates later).
- We do **not** build all 60+ tables up front. Tables are added module-by-module as the sprint that needs
  them arrives, per section 5 of the technical document.
- "Phase gate" reviews (informal): before starting a new Phase, re-confirm scope still matches the business
  need — priorities may shift after real users touch the MVP.

## 2. Repository layout

```
Ovigo/
├── backend/                 # FastAPI app  → deployed to FastAPI Cloud
├── frontend/                # Next.js app  → deployed to Vercel
├── .github/workflows/       # CI (lint/test on PR, backend+frontend)
├── OVIGO_TECHNICAL_DOCUMENT.md
├── IMPLEMENTATION_PLAN.md   # this file
└── PROGRESS_TRACKER.md      # live status, updated every sprint
```

Rationale for `backend/` + `frontend/` (rather than the doc's `fastapi-app/` / `nextjs-app/`): matches the
"root directory" setting both Vercel and FastAPI Cloud expect for a monorepo, keeps deploy config simple.

## 3. Environments & hosting

| Layer | Service | Notes |
|---|---|---|
| Database | **NeonDB PostgreSQL** | Single connection string for now (dev). Add a Neon branch for staging once Phase 1 traffic exists. |
| Backend API | **FastAPI Cloud** | Deploy via `fastapi deploy` from `backend/`, or GitHub auto-deploy once the repo is connected in the FastAPI Cloud dashboard. |
| Frontend | **Vercel** | Project root = `frontend/`. Connected to GitHub for auto-deploy on push to `main` (preview deploys on branches/PRs). |
| Source control | **GitHub** — `salman1237/Ovigo` | Already connected (`gh` authenticated locally). |

### One-time manual steps (require a human/browser — cannot be done from this session)

1. **FastAPI Cloud**: run `fastapi login` once from `backend/` (opens a browser) *or* connect the GitHub repo
   directly from the FastAPI Cloud dashboard → Import → pick `salman1237/Ovigo`, set root directory to
   `backend`. Add the `DATABASE_URL` and other secrets in the FastAPI Cloud project's Environment Variables.
2. **Vercel**: project will be linked via `vercel link` / `vercel git connect` from this session (CLI is
   already authenticated as `salman1237`), root directory `frontend`. Environment variables (`NEXT_PUBLIC_API_URL`,
   `NEXTAUTH_SECRET`, etc.) need to be confirmed/added in the Vercel dashboard once real values exist.
3. **Secrets hygiene**: the NeonDB connection string is kept only in `backend/.env` (gitignored) and in each
   host's environment-variable settings — never committed, never printed in full again after initial setup.

## 4. Working rhythm per sprint

1. Read the sprint's deliverables from `OVIGO_TECHNICAL_DOCUMENT.md` §8.
2. Implement backend module(s): models → Alembic migration → schemas → service → router → tests.
3. Implement frontend piece(s) that consume the new API.
4. Update `PROGRESS_TRACKER.md` (mark items done, note any deviations).
5. Commit with a `feat(scope): ...` message, push to `main`.
6. If FastAPI Cloud / Vercel auto-deploy is connected, deployment happens automatically on push; otherwise
   flag to the user that a manual deploy step is pending.

## 5. Current status

See [PROGRESS_TRACKER.md](PROGRESS_TRACKER.md) for the live sprint-by-sprint checklist.
