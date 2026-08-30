# OVIGO — Progress Tracker

> Updated at the end of every sprint slice. Status values: `Not started` · `In progress` · `Done` · `Blocked`.
> See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for how we work, and
> [OVIGO_TECHNICAL_DOCUMENT.md](OVIGO_TECHNICAL_DOCUMENT.md) for full spec per sprint.

_Last updated: 2026-08-30_

## Infrastructure & deployment status

| Item | Status | Notes |
|---|---|---|
| GitHub repo | Done | `salman1237/Ovigo`, connected |
| NeonDB | Done | Connection string configured in `backend/.env` (gitignored); 4 tables live (`users`, `partner_accounts`, `partner_roles`, `locations`) |
| Backend scaffold | Done | FastAPI app, config, async SQLAlchemy engine, Alembic wired to Neon |
| Frontend scaffold | Done | Next.js 16 (App Router, Tailwind v4, TypeScript), builds clean |
| Vercel project link + auto-deploy | Done | Project `ovigo` (`salman2033` team) linked, GitHub repo connected, production live at `ovigo.vercel.app`. |
| FastAPI Cloud project + auto-deploy | Blocked on user | User logged in, created the app, and connected GitHub. Build failed: "Could not find a default file to run" — the app was deployed from the repo root, but the FastAPI app lives in `backend/`. Fixed on our side: added `backend/main.py` (shim re-exporting `app.main:app`) and a full `pyproject.toml` (`tool.uv package = false`, verified with a clean `uv`-resolved venv), pushed in commit `c917df7`. **User action needed:** in the FastAPI Cloud dashboard → app settings → Application Directory, set it to `backend`, then redeploy (push already happened, so a new push or manual redeploy trigger should pick it up). |
| CI (GitHub Actions) | Done | `.github/workflows/ci.yml` — backend pytest + frontend lint/build on push/PR to `main` |

## Phase 1 — Core Marketplace (MVP)

### Sprint 1-2 — Foundation & Auth (Wk 1-4)

| Task | Status |
|---|---|
| Project scaffolding (FastAPI + Next.js + NeonDB) | Done |
| Database schema design & initial migration (users, partners, roles, locations) | Done — base tables only; verification docs, application workflow & public profiles land in Sprint 3-4+ |
| Auth module (register, login, JWT, refresh, OTP) | Done — register/login/refresh/logout + dev-mode email/phone OTP verify. Smoke-tested end-to-end against Neon. Forgot-password flow deferred to a later sprint. |
| RBAC foundation | Done — `system_role` enum (traveler/admin/super_admin) + `require_roles` dependency factory. Partner-role-based permissions extend this in Sprint 3-4. |
| CI/CD pipeline (GitHub Actions → FastAPI Cloud + Vercel) | Partial — GitHub Actions CI (test+lint+build) done. Auto-deploy to FastAPI Cloud / Vercel needs one-time manual account linking (see Infrastructure table above). |

**Deviations from spec:** Next.js scaffolded at v16.3.3 (latest stable) rather than the doc's "Next.js 15" — App Router API is unchanged, no impact on the plan.

### Sprint 3-4 — Partner Onboarding & Locations (Wk 5-8)

| Task | Status |
|---|---|
| Partner registration with dynamic role selection | Not started |
| Multi-role account system | Not started |
| Verification document upload & status tracking | Not started |
| Role approval workflow | Not started |
| Location hierarchy CRUD (Country → Attraction) | Not started |
| Location tagging system | Not started |
| Basic Admin panel: partner approvals, location mgmt | Not started |

### Sprint 5-6 — Tour & Stay Listings (Wk 9-12)

| Task | Status |
|---|---|
| Local Expert profile creation | Not started |
| Fixed-date tour creation with mandatory fields | Not started |
| Tour itinerary, stays, transport, meals, activities, add-ons | Not started |
| Tour publishing workflow & admin approval | Not started |
| Host profile & property creation | Not started |
| Room/unit management | Not started |
| Availability calendar | Not started |
| Property amenities, policies, images | Not started |
| Stay search & discovery | Not started |
| Tour search by destination | Not started |

### Sprint 7-8 — Booking, Payment & Reviews (Wk 13-16)

| Task | Status |
|---|---|
| Booking engine (tour + stay) | Not started |
| Unified booking with multiple service items | Not started |
| Guest information management | Not started |
| Payment integration (bKash/SSLCommerz) | Not started |
| Basic escrow (hold until completion) | Not started |
| Commission calculation (global + role-based) | Not started |
| Verified review system (post-completion only) | Not started |
| Booking status flow | Not started |
| Basic partner dashboards (Expert, Host) | Not started |

### Sprint 9 — MVP Polish & Launch Prep (Wk 17-18)

| Task | Status |
|---|---|
| Super Admin dashboard: bookings, payments, disputes overview | Not started |
| Basic notification system (email + in-app) | Not started |
| Security hardening, rate limiting, input validation | Not started |
| Performance optimization, caching | Not started |
| UAT, bug fixes, deployment | Not started |

## Phase 2 — Customization & Network

Not started. See technical document §8, Phase 2.

## Phase 3 — Growth & Monetization

Not started. See technical document §8, Phase 3.

## Phase 4 — Scale & Expansion

Not started. See technical document §8, Phase 4.

## MVP Acceptance Criteria (from technical document §11)

| # | Criteria | Status |
|---|---|---|
| 1 | A partner can register and select a role | Pending |
| 2 | Admin can verify and approve each role separately | Pending |
| 3 | A Local Expert can create a fixed-date tour with all mandatory service details | Pending |
| 4 | A traveler can search tours using destination tags | Pending |
| 5 | A traveler can view the Expert's verified profile and successful-tour count | Pending |
| 6 | A Host can create a property, room inventory and availability calendar | Pending |
| 7 | A traveler can search and book a stay | Pending |
| 8 | A booking cannot exceed available inventory | Pending |
| 9 | A traveler can pay and receive confirmation | Pending |
| 10 | Ovigo commission is calculated automatically | Pending |
| 11 | Partner earnings appear in the correct dashboard | Pending |
| 12 | Only completed bookings generate review eligibility | Pending |
| 13 | A Local Expert can add a Guide under supervision | Pending |
| 14 | A Local Expert can add a referred business | Pending |
| 15 | Referral attribution is stored | Pending |
| 16 | Admin can manage disputes, refunds and payout holds | Pending |
| 17 | Partners can purchase featured placement | Pending |
| 18 | Sponsored results are visibly labelled | Pending |
| 19 | All important Admin actions are audit logged | Pending |
| 20 | Tour, stay and partner profiles cannot be published without location tags | Pending |
