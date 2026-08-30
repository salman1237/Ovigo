# OVIGO — Progress Tracker

> Updated at the end of every sprint slice. Status values: `Not started` · `In progress` · `Done` · `Blocked`.
> See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for how we work, and
> [OVIGO_TECHNICAL_DOCUMENT.md](OVIGO_TECHNICAL_DOCUMENT.md) for full spec per sprint.

_Last updated: 2026-08-30 (Sprint 7-8 complete — Phase 1 MVP feature-complete pending Sprint 9 polish)_

## Infrastructure & deployment status

| Item | Status | Notes |
|---|---|---|
| GitHub repo | Done | `salman1237/Ovigo`, connected |
| NeonDB | Done | Connection string configured in `backend/.env` (gitignored); 30 tables live — see Sprint 5-6 (13 tables) and Sprint 7-8 (`bookings`, `booking_items`, `booking_guests`, `booking_status_history`, `payments`, `escrow_transactions`, `commissions`, `reviews`) additions below |
| Cloudflare R2 | Done | `ovigo` bucket, S3-compatible credentials in `backend/.env` and on FastAPI Cloud — see Sprint 5-6 image storage notes |
| SSLCommerz | Done | Sandbox store credentials in `backend/.env` and on FastAPI Cloud — see Sprint 7-8 payment notes |
| Backend scaffold | Done | FastAPI app, config, async SQLAlchemy engine, Alembic wired to Neon |
| Frontend scaffold | Done | Next.js 16 (App Router, Tailwind v4, TypeScript), builds clean |
| Vercel project link + auto-deploy | Done | Project `ovigo` (`salman2033` team) linked, GitHub repo connected, production live at `ovigo.vercel.app`, built with `NEXT_PUBLIC_API_URL` pointing at the live backend (confirmed baked into the production JS bundle). |
| FastAPI Cloud project + auto-deploy | Done | Live at `https://ovigo-e5f049a8.fastapicloud.dev`, GitHub-connected, deploying from Application Directory `backend`. Root cause of the earlier failures: a `pyproject.toml` with a `[project]` table made `uv` treat the backend as an installable package, which broke on the flat `app/`+`migrations/`+`tests/` layout — fixed by deleting `pyproject.toml` and installing straight from `requirements.txt` (matching a sibling project's proven-working setup), plus pinning Python to 3.12 (`.python-version`) since FastAPI Cloud's default 3.14 had no prebuilt wheel for our pinned `pydantic-core`. Required env vars (`DATABASE_URL`, `SYNC_DATABASE_URL`, `JWT_SECRET_KEY`, `ENVIRONMENT`, `CORS_ORIGINS`) set via `fastapi cloud env set`. End-to-end smoke test (register → login) verified against the live Neon DB. |
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
| Partner registration with dynamic role selection | Done — `POST /api/v1/partners/roles`, frontend form at `/account/partner` (role dropdown disables already-applied types) |
| Multi-role account system | Done — `PartnerAccount` holds N `PartnerRole`s; re-applying after rejection is supported. Active-role switching (for per-role dashboards) deferred to Sprint 5-6 when there's a dashboard to switch into |
| Verification document upload & status tracking | Done — multipart upload, stored as `bytea` in Postgres (not S3/R2 — no credential configured yet, and FastAPI Cloud's container disk is ephemeral anyway; see `partners/models.py` docstring). 5MB cap |
| Role approval workflow | Done — admin approve/reject with reason, document verify/reject, all audit-logged |
| Location hierarchy CRUD (Country → Attraction) | Done — full CRUD, `/hierarchy` tree endpoint, `/search` autocomplete (ILIKE for now; upgrades to pg_trgm/full-text in the Search module) |
| Location tagging system | Done — generic `location_tags` junction (`TaggableEntityType`), wired up for partner roles; tours/properties become new consumers in Sprint 5-6 |
| Basic Admin panel: partner approvals, location mgmt | Done — `/admin/partners` (tabs by status, approve/reject, document review) and `/admin/locations` (tree view, create/delete) |

**Bootstrap tooling:** `backend/scripts/set_admin.py` (promote a user to admin/super_admin — there's no self-serve admin signup by design) and `backend/scripts/seed_locations.py` (starter Bangladesh location tree for testing).

**Verified:** Full flow smoke-tested end-to-end against Neon — register applicant → apply for role → tag location → upload document → promote admin via script → admin lists pending → verifies document → approves role → applicant sees `approved` status → audit log shows both actions → non-admin gets 403 on admin routes. Cleaned up test data after.

**Known tech debt (non-blocking, noted for later):** (1) SQLAlchemy's `Enum` type stores Python enum *names* (e.g. `ADMIN`) rather than `.value` (`admin`) at the DB column level — the ORM round-trips this transparently so the API is unaffected, but raw SQL/reporting against these columns needs to match on the uppercase name. Worth a `values_callable` fix before Phase 3 analytics does raw SQL. (2) `location_tags.entity_id` has no real FK (it's generic across entity types), so deleting a tagged entity (e.g. a partner role) leaves an orphaned tag row — harmless today, but each future entity type's delete path should clean up its own tags.

### Sprint 5-6 — Tour & Stay Listings (Wk 9-12)

| Task | Status |
|---|---|
| Local Expert profile creation | Done — `PUT/GET /api/v1/partners/profiles/expert`, requires an approved Local Expert role |
| Fixed-date tour creation with mandatory fields | Done — title, description, duration, base price, max group size; draft → pending_review → published/rejected lifecycle |
| Tour itinerary, stays, transport, meals, activities, add-ons | Done — each as its own child table with add/delete endpoints (`/dashboard/tours/[id]` UI). `tour_stays`/`tour_transport` are lightweight descriptive line items rather than deep Property/Vehicle integrations — see `tours/models.py` docstring |
| Tour publishing workflow & admin approval | Done — `submit` requires ≥1 itinerary day, ≥1 departure, ≥1 location tag (MVP AC #20 enforced, verified by test); admin approve/reject at `/admin/tours`, audit-logged |
| Host profile & property creation | Done — `PUT/GET /api/v1/partners/profiles/host`, requires an approved Host or Hotel role |
| Room/unit management | Done — `room_types` per property (name, max occupancy, price, unit count); individual physical-room tracking deferred (hotel-grade feature, Phase 3) |
| Availability calendar | Done — `availability_calendars` (room type × date × available units, optional price override), settable as a date range in one call |
| Property amenities, policies, images | Done — amenities and policies (policies embedded as columns on `properties` — see model docstring for why); images via Cloudflare R2 (see "Image storage" note below) |
| Stay search & discovery | Done — `/api/v1/search/stays` filters by destination (including descendant destinations, e.g. searching "Bangladesh" surfaces Cox's Bazar) and by actual date-range availability, not just location |
| Tour search by destination | Done — `/api/v1/tours?location_slug=` and `/api/v1/search/experts`; `/api/v1/search/destinations` returns locations with published-listing counts |

**Frontend:** `/dashboard/tours` + `/dashboard/tours/[id]` (Local Expert), `/dashboard/properties` + `/dashboard/properties/[id]` (Host), `/admin/tours` + `/admin/properties` (moderation queues), `/tours` + `/tours/[id]` and `/stays` + `/stays/[id]` (public search/detail). Builds and lints clean.

**Bugs found and fixed during this sprint's own verification** (both caught by the smoke test, not by the user — noting since they're instructive):
1. **Stale relationship data in "add child" responses.** Every `add_itinerary_day`/`add_room_type`/etc. function fetched the parent (with eager-loaded children) *before* mutating, then re-fetched after commit to build the response — but SQLAlchemy's identity map handed back the first fetch's already-loaded (now stale) collection instead of re-querying it, so the API response silently omitted whatever was just added, even though the DB write itself was correct. Fixed with `execution_options(populate_existing=True)` on `get_own_tour_or_404`/`get_own_property_or_404`/the `_for_view` variants. This is a general pattern risk — any future "mutate then re-fetch in the same session" code should use it too.
2. **`ALTER TYPE ... ADD VALUE` isn't autogenerated.** Adding `TOUR`/`PROPERTY` to the existing `TaggableEntityType` enum wasn't picked up by `alembic revision --autogenerate` (it only detects new/dropped tables and columns, not new values on an existing native Postgres enum) — required a hand-written migration.

**Verified:** A full expert-and-host smoke test against Neon — apply for both roles, admin-approve both, create+build+tag+submit+approve a tour, create+build+tag+set-availability+submit+approve a property, confirm both show up in public listings and in destination/date-filtered search (including a negative case: an uncovered date range correctly excludes the property), and confirm submitting a tour with no location tag is rejected (409).

**Image storage (Cloudflare R2), added after the initial sprint pass:** the user set up an R2 bucket + API token and provided credentials. Implemented `app/core/storage.py` (boto3 S3-compatible client, 8MB cap, JPEG/PNG/WebP/GIF only) and wired it into three places: `tour_images` and `property_images` galleries (add/delete/list, max 10/15 per listing), and a single profile photo each for `local_expert_profiles`/`host_profiles`. Images are served through a backend proxy endpoint (`GET .../file`) rather than direct public R2 URLs, so the bucket doesn't need "Public Access" enabled — same trade-off as partner documents (traffic round-trips through FastAPI Cloud instead of hitting a CDN edge; swap to public r2.dev URLs or a custom domain later without touching upload code). Credentials set as env vars on both local `.env` and FastAPI Cloud. Frontend: a shared `ImageGallery` component (handles authenticated blob fetch + object URLs, since `<img src>` can't carry an Authorization header) wired into `/dashboard/tours/[id]` and `/dashboard/properties/[id]`; also added the previously-missing `/dashboard/profile` page (expert/host bio + photo editing — there was no UI for this at all before). Verified end-to-end: direct R2 upload/fetch/delete round-trip, then a full HTTP smoke test (profile photo upload+fetch+byte-for-byte match, tour image upload+fetch+delete+confirm-gone, non-image upload correctly rejected with 409).

Partner verification documents (Sprint 3-4) still use Postgres `bytea`, not R2 — low-value to migrate today (small volume, private/admin-only access, no CDN benefit), but the same `storage.py` helper would apply if it's worth doing later.

**New known tech debt:** deleting a user cascades through `partner_accounts` → `partner_roles` → `local_expert_profiles`/`tour_images`/`property_images` at the DB level, but nothing deletes the corresponding R2 objects — a hard-deleted user (or, later, a hard-deleted tour/property) leaves orphaned files in the bucket. Same category of issue as the `location_tags` orphan gap already noted. Not urgent (soft-delete is the norm elsewhere, and storage cost at this scale is negligible), but worth a cleanup hook — e.g. a SQLAlchemy `before_delete` event, or a periodic reconciliation job — before this matters at real scale.

### Sprint 7-8 — Booking, Payment & Reviews (Wk 13-16)

| Task | Status |
|---|---|
| Booking engine (tour + stay) | Done — inventory locked with `SELECT ... FOR UPDATE` inside the same transaction the booking is created in (MVP AC #8: a booking cannot exceed available inventory, verified including a concurrent-request-shaped negative test) |
| Unified booking with multiple service items | Done — one booking can hold a tour departure item and a room-type item together, verified with a mixed booking |
| Guest information management | Done — `booking_guests`, free-form name/age/id_document per booking |
| Payment integration (bKash/SSLCommerz) | Done for SSLCommerz — real sandbox integration (session initiation + validation API), confirmed against the actual gateway, not just mocked. bKash not integrated — SSLCommerz already routes bKash/Nagad/cards/mobile banking through one gateway, so a separate direct bKash integration wasn't needed for MVP; revisit only if a bKash-specific feature (not available via SSLCommerz) is required |
| Basic escrow (hold until completion) | Done — one `escrow_transactions` row per booking, HELD at payment confirmation; released is a status flag only (no real money movement — payout processing is Phase 2) |
| Commission calculation (global + role-based) | Done — flat per-item-type rate (10% tours, 12% stays) computed per booking item at payment confirmation; PENDING until the booking completes, then PAYABLE. Configurable per-partner rules are explicitly Phase 2 ("Advanced commission engine") |
| Verified review system (post-completion only) | Done — gated on the specific booking item being COMPLETED (MVP AC #12, verified: blocked before completion, allowed after, duplicate rejected) |
| Booking status flow | Done — pending_payment → confirmed → checked_in → checked_out → completed, with cancellation releasing held inventory; full history in `booking_status_history` |
| Basic partner dashboards (Expert, Host) | Done — `/dashboard/earnings` (commission summary, pending vs payable) |

**Payment confirmation has two independent paths**, both converging on the same idempotent `_confirm_payment` function: SSLCommerz's IPN (server-to-server callback, the documented source of truth, but needs a publicly reachable URL and isn't guaranteed to arrive instantly) and the customer's browser redirect to `success_url` (which also carries `val_id` and independently calls the Validation API). This is more robust than relying on IPN alone — confirmation doesn't strictly depend on IPN delivery.

**Frontend:** booking forms on `/tours/[id]` and `/stays/[id]` (create booking → initiate payment → redirect to SSLCommerz's hosted checkout), `/bookings` + `/bookings/[id]` (status, check-in/out, cancel, inline review submission on completed items), `/dashboard/earnings`, and a shared `ReviewsList` component on both public detail pages. One frontend simplification: each booking form creates a single-item booking (tour-only or stay-only) — the backend fully supports multi-item unified bookings (proven in the smoke test), but a cart-style "combine a tour and a stay into one checkout" UI is deferred; most real usage is single-item anyway.

**Bug found and fixed during this sprint's own verification** (same root cause as the Sprint 5-6 finding, worth calling out again since it bit a different codepath): `app/main.py` imports each module's router in sequence, and `bookings/service.py` builds a module-level `selectinload(Booking.items)` tuple at import time — which forces SQLAlchemy to configure every relationship it can reach, including `BookingItem.reviews -> "Review"` by string name. Since `reviews_router` was imported *after* `bookings_router`, that name didn't exist yet and mapper configuration crashed with `KeyError: 'Review'`. Fixed by importing `app.all_models` (which loads every module's models up front) as the very first import in `main.py`, before any router — so router import order stops mattering at all, permanently, not just for this one pair of modules.

**Verified:** a comprehensive smoke test against Neon and the real SSLCommerz sandbox — unified booking (tour + stay) with correct total; inventory correctly decremented for both seats and room-nights; overbooking rejected (409); a genuine SSLCommerz session-initiation call (not mocked) returning a real `GatewayPageURL`; payment confirmation (simulated at the internal-function level, since completing an actual hosted card payment needs a human browser — see below) correctly moving the booking to `confirmed`, creating escrow, and computing both partner commissions with the right rates; review blocked pre-completion (409); check-in → check-out → auto-complete with all items marked completed; commission transitioning `pending` → `payable` on completion; review creation, duplicate-rejection, and public listing; and cancelling a pending booking correctly releasing its held inventory.

**What still needs a human:** the actual SSLCommerz hosted checkout page (entering a sandbox test card and completing payment) can't be driven from this environment — that needs a real browser. The session-initiation and validation APIs were both verified for real against the sandbox, and the confirmation logic they feed into was verified with a simulated payload, so the only untested link is SSLCommerz's own checkout UI and its IPN delivery to our `/api/v1/payments/ipn` endpoint. Worth one manual end-to-end test (real card, real redirect) before this goes anywhere near production traffic.

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
| 1 | A partner can register and select a role | Done |
| 2 | Admin can verify and approve each role separately | Done |
| 3 | A Local Expert can create a fixed-date tour with all mandatory service details | Done |
| 4 | A traveler can search tours using destination tags | Done |
| 5 | A traveler can view the Expert's verified profile and successful-tour count | Done — `/api/v1/search/experts` now returns a real count of completed tour-departure bookings per expert, not a stub |
| 6 | A Host can create a property, room inventory and availability calendar | Done |
| 7 | A traveler can search and book a stay | Done |
| 8 | A booking cannot exceed available inventory | Done — `SELECT ... FOR UPDATE` row locking, verified with an overbooking attempt correctly rejected |
| 9 | A traveler can pay and receive confirmation | Done — real SSLCommerz sandbox integration; see Sprint 7-8 notes for what still needs a manual human test (the hosted checkout page itself) |
| 10 | Ovigo commission is calculated automatically | Done |
| 11 | Partner earnings appear in the correct dashboard | Done — `/dashboard/earnings` |
| 12 | Only completed bookings generate review eligibility | Done |
| 13 | A Local Expert can add a Guide under supervision | Pending |
| 14 | A Local Expert can add a referred business | Pending |
| 15 | Referral attribution is stored | Pending |
| 16 | Admin can manage disputes, refunds and payout holds | Pending |
| 17 | Partners can purchase featured placement | Pending |
| 18 | Sponsored results are visibly labelled | Pending |
| 19 | All important Admin actions are audit logged | Done so far (role approve/reject, document verify/reject) — extend as each new admin action lands |
| 20 | Tour, stay and partner profiles cannot be published without location tags | Done — enforced server-side at submit time for both tours and properties (verified: submitting without a tag returns 409); partner-role profiles don't have a separate "publish" gate yet since they're not publicly browsable pages on their own outside search results |
