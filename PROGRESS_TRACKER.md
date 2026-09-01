# OVIGO — Progress Tracker

> Updated at the end of every sprint slice. Status values: `Not started` · `In progress` · `Done` · `Blocked`.
> See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for how we work, and
> [OVIGO_TECHNICAL_DOCUMENT.md](OVIGO_TECHNICAL_DOCUMENT.md) for full spec per sprint.

_Last updated: 2026-09-01 (Sprint 14-15 complete — Financial Engine, Trust Badges, Rent-a-Car module and the multi-service booking cart all shipped)_

## Infrastructure & deployment status

| Item | Status | Notes |
|---|---|---|
| GitHub repo | Done | `salman1237/Ovigo`, connected |
| NeonDB | Done | Connection string configured in `backend/.env` (gitignored); 44 tables live — see Sprint 5-6 (13 tables), Sprint 7-8 (`bookings`, `booking_items`, `booking_guests`, `booking_status_history`, `payments`, `escrow_transactions`, `commissions`, `reviews`), Sprint 9 (`notifications`, `disputes`), Sprint 10-11 (`custom_tour_requests`, `tour_bids`), Sprint 12-13 (`guide_supervision`, `guide_assignments`, `guide_availability`, `business_referrals`), Sprint 14-15 Part 1 (`commission_rules`, `payouts`, `badges`) and Sprint 14-15 Part 2 (`drivers`, `vehicles`, `vehicle_availability`) additions below |
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
| Super Admin dashboard: bookings, payments, disputes overview | Done — `GET /api/v1/admin/bookings` and `/admin/payments` (status-filterable, 200-row cap), plus a full disputes module (see below); frontend `/admin/bookings`, `/admin/payments`, `/admin/disputes` |
| Basic dispute system (MVP AC #16) | Done — new `disputes` module: a traveler opens a dispute against their own booking (one open dispute per booking at a time), an admin resolves it as refunded or rejected with a note. A refund resolution flips the booking's `EscrowTransaction` to `REFUNDED` (a bookkeeping flag, same trade-off as escrow release generally — no real payout integration yet, that's Phase 2). Both the raising traveler and every admin get a notification. Frontend: a "Report a problem" section on `/bookings/[id]`, admin resolve UI on `/admin/disputes`. |
| Basic notification system (email + in-app) | In-app done — new `notifications` module (13 event types) wired into ~10 real call sites: role/document approve+reject, tour/property approve+reject, booking confirmed/cancelled/completed, payment failed, new review, dispute opened/resolved. Bell icon + dropdown in the header (`NotificationBell`, polls unread count every 30s). Email/SMS delivery deferred — no provider credential (SendGrid/SES/Twilio) available; `notifications/service.py`'s `notify()` is written so adding a delivery branch later doesn't touch any of the call sites. |
| Security hardening, rate limiting, input validation | Done — `slowapi` rate limiting on auth endpoints (register/login: 10/min, OTP request: 5/min, keyed by IP, in-memory store) with a proper 429 response; baseline security headers middleware (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production) on every response. Input validation was already Pydantic-enforced throughout since Sprint 1-2. |
| Performance optimization, caching | Done — added `index=True` to 10 previously-unindexed hot FK columns (`bookings.user_id`, `booking_items.booking_id`, `payments.booking_id`, `reviews.tour_id`/`property_id`, `commissions.partner_role_id`, `locations.parent_id`, `location_tags.location_id`, `tour_departures.tour_id`, `room_types.property_id`); a minimal in-process TTL cache (`app/core/cache.py`) on `/locations/hierarchy` (5 min, invalidated on any admin location write) and `/search/destinations` (2 min, TTL-only) — measured 2.37s → 7.5ms and 1.15s → 5.7ms respectively on cache hit. |
| UAT, bug fixes, deployment | Done — see Verified section below |

**New tables:** `notifications`, `disputes` (2 migrations). **New indexes:** 1 migration, 10 indexes, no schema shape change. All three applied to Neon and verified.

**Verified:** every new backend piece was smoke-tested against the real Neon DB (not just unit-style mocks) — notifications: full CRUD/mark-read/mark-all-read cycle directly, plus an end-to-end HTTP flow (register → admin rejects a partner role application → applicant's `/api/v1/notifications` shows the correctly-worded notification). Disputes: open → duplicate-open-rejected (409) → admin lists it → admin resolves with refund → escrow flips to `REFUNDED` → traveler notified → re-resolving an already-resolved dispute correctly rejected (409); plus HTTP-level auth/ownership checks (404 on someone else's booking, 403 on the admin endpoint without an admin role). Admin overview: real booking+payment rows created directly in Neon, fetched through `/api/v1/admin/bookings` and `/admin/payments` with status filters, fields match. Rate limiting: hammered `/api/v1/auth/register` 12 times in a row — first 10 succeeded (201), 11th and 12th correctly got 429. Security headers: confirmed present on a plain `/health` response. Caching: confirmed both dramatic latency drop on cache hit and immediate invalidation after an admin location write (no stale-tree window). Frontend: `npm run lint` and `npm run build` both clean with all new pages (`/admin/bookings`, `/admin/payments`, `/admin/disputes`) and the notification bell included in the production build. All test data (throwaway users/bookings/payments) cleaned up from Neon after each check — nothing left behind in production data.

**Post-deploy production bugs found via real user testing (fixed same day):**
1. SSLCommerz redirects the customer's browser to `success_url`/`fail_url`/`cancel_url` via an auto-submitting POST form (full transaction payload in the POST body, same as the IPN payload) — the callback endpoints only accepted GET, so real checkouts hit a 405 and were never confirmed via the redirect path. Fixed by accepting both GET and POST and reading `tran_id`/`val_id` from whichever of query params or form body is present. Verified with a real SSLCommerz sandbox bKash payment end-to-end after the fix: booking correctly moved to `confirmed`.
2. Every price on the frontend was hardcoded with a `$` prefix despite the platform being BDT-only. Added a shared `formatMoney()` helper (`frontend/src/lib/format.ts`) showing `৳` and applied it everywhere a price is displayed.

## Phase 2 — Customization & Network

### Sprint 10-11 — Custom Tour Bidding (Wk 19-22)

| Task | Status |
|---|---|
| Custom tour request form | Done — traveler posts destination, dates, group size, optional budget range |
| Expert eligibility engine | Done — an approved Local Expert is eligible if any of their tagged locations is the request's tagged location or one of its ancestors (a "Chittagong" tag covers a "Cox's Bazar" request, mirroring how destination search already treats a country tag as covering its cities) |
| Bid submission with full itinerary | Done — price, message, day-by-day itinerary |
| Bid comparison view | Done — traveler sees all bids on their request sorted by price |
| Bid status workflow | Done — pending → accepted/rejected/withdrawn; accepting one bid auto-rejects every other pending bid on the same request and closes the request |
| Bid-to-booking conversion | Done — accepting a bid creates a real `Booking` with a new `BookingItemType.CUSTOM_BID` item at the bid's server-side price, reusing the entire existing payment/commission/escrow/notification pipeline rather than a parallel one |
| Bidding controls (limits, fees, penalties) | Partial — one bid per expert per request (unique constraint), one open dispute-style accept flow. No bid fees or late-withdrawal penalties: there's no partner wallet/payout system yet for either to charge against (that's Sprint 14-15 "Financial Engine") |

**Design decisions:** bid itineraries are stored as JSONB on the bid row, not a relational child table like `TourItineraryDay` — a bid's itinerary is a point-in-time snapshot never queried independently, so a table would only add migration overhead. Custom-bid bookings are created server-side only (`bookings/service.py`'s `create_booking_from_bid`, called from `bidding/service.py`'s `accept_bid`) — the generic `POST /api/v1/bookings` endpoint explicitly rejects `item_type: custom_bid` in its request schema, so a client can never construct a custom-bid booking with a self-chosen price; the price always comes from the accepted bid. Commission rate for custom bids is 10%, same as published tours (expert-delivered work either way).

**New tables:** `custom_tour_requests`, `tour_bids`. **Enum extensions:** `TaggableEntityType.CUSTOM_TOUR_REQUEST`, `BookingItemType.CUSTOM_BID`, three new `NotificationType` values (`new_bid`, `bid_accepted`, `bid_rejected`). One migration, applied to Neon.

**Frontend:** `/custom-requests` (post + list own requests), `/custom-requests/[id]` (bid comparison + accept, redirects straight into the existing `/bookings/[id]` payment flow on accept), `/dashboard/bids` (eligible open requests + bid submission form for experts, plus a "my bids" tab with withdraw).

**Verified:** a full scripted smoke test against Neon — 3 experts tagged to different locations (exact match, ancestor match, unrelated) confirm the eligibility engine correctly includes the first two and excludes the third; an ineligible bid attempt correctly rejected (403); a duplicate bid from the same expert on the same request correctly rejected (409); accepting one bid correctly rejects the other pending bid and closes the request, with both experts and the traveler notified correctly; the resulting booking carries the exact bid price through the standard payment confirmation → commission calculation pipeline (10% rate, correct partner attribution) with no code changes needed in either module; re-accepting on a closed request and withdrawing an already-accepted bid both correctly rejected. Also verified at the HTTP layer end-to-end (register → apply → approve → tag → create request → bid → accept → fetch the resulting booking through the ordinary `/api/v1/bookings/{id}` endpoint) to confirm every response shape matches the frontend's TypeScript types exactly. Frontend `npm run lint` and `npm run build` both clean.

### Sprint 12-13 — Guide Supervision & Business Network (Wk 23-26)

| Task | Status |
|---|---|
| Guide registration & verification | Done — reuses the existing generic `PartnerRole`/admin-approval flow from Sprint 1-2 unchanged; a Guide role is a `PartnerRoleType.GUIDE` row like any other, admin-approved through the same `/api/v1/admin/partners/roles` endpoints |
| Expert-Guide supervision relationships | Done — a Local Expert invites an existing Ovigo user by email; a `PartnerAccount`/`PartnerRole(GUIDE)` is created for them if they don't have one, and a `GuideSupervision` row (PENDING) links them. The invited person accepts or declines. A Guide is supervised by at most one Expert at a time (DB-level unique constraint on `guide_role_id`) |
| Guide assignment workflow | Done — an Expert assigns their (accepted + admin-approved) Guide to one of their own tour departures, with an optional fee. Assignment lifecycle: assigned → checked_in → completed, or cancelled by the expert |
| Guide dashboard (availability, assignments, check-in/out, earnings) | Done — `/dashboard/guide`: accept/decline/end supervision, a simple date-blockout availability calendar (60-day window), assignment list with check-in/complete actions, and an earnings total (sum of completed-assignment fees) |
| Business referral system (add, invite, ownership types) | Done — a Local Expert adds a business they know, marking it `owned` (they own/co-own it) or `referred` (pure referral). No "invite" step for the business itself — v1 is a one-way attributed listing, not a two-sided connection like Guide supervision |
| Business approval workflow | Done — admin approve/reject with a reason, reusing the same `RejectRequest` shape as tours/properties; audit-logged |
| Attribution & referral commission tracking | Partial — attribution is fully stored (`referring_expert_role_id` on every referral, satisfies MVP AC #15). Commission *tracking* against a referred business's actual activity isn't implemented — see the scope note below |
| Network commission engine | Not implemented this sprint — see scope note |

**Scope note (Business Network commission engine):** a referred business isn't necessarily a bookable partner on Ovigo at all — it might just be a trusted local recommendation with no account of its own. There's no booking activity to calculate a referral commission against unless and until a referred business itself registers as an actual partner (Hotel, Rent-a-Car, ...). Building a real "network commission engine" now would mean guessing at a connection that doesn't exist yet. This is deliberately left for the technical document's own Sprint 14-15 ("Advanced commission engine — category, partner-specific, referral, network"), which is exactly where that connection belongs once there's real activity to attribute.

**Design decisions:** Guide "earnings" shown on the dashboard are informational only — a per-assignment fee the supervising Expert enters, summed for completed assignments. It's a private arrangement between Expert and Guide, not an Ovigo commission; no real payout or ledger entry is created, the same flag-only treatment given to every other financial feature ahead of Phase 2's later Financial Engine sprint (escrow release, dispute refunds, and now this). Guide availability is advisory, not enforced — assigning a guide to a departure doesn't check or block on their marked-unavailable dates; the doc calls for an availability *display*, not a hard scheduling conflict system, and enforcing it well would need to handle a guide holding assignments from only one expert at a time anyway (already true, since a guide has one active supervisor) so the collision surface is naturally small.

**Bug found and fixed during this sprint's own HTTP-level verification** (not caught by the service-level smoke test, because of session/identity-map behavior masking it there — worth calling out for that reason): two real bugs surfaced only when driving the flow over real HTTP requests, each with its own fresh DB session, rather than through direct service-layer calls sharing one session:
1. A Guide couldn't accept their own supervision invite — the endpoint required an *already-approved* Guide role, but approval naturally comes *after* acceptance in the intended flow (invite → accept → admin approves the role). Fixed by adding a new `require_role()` permission dependency (checks a partner role exists, without requiring `APPROVED` status) alongside the existing `require_approved_role()`, and switching every Guide-side self-service endpoint (respond to invite, view own supervision, assignments, check-in/complete, availability, earnings) to use it — approval is still enforced exactly once, at the point that actually matters: assignment creation.
2. Assigning a guide crashed with `MissingGreenlet` — `_active_supervision_for()`'s query was missing the eager-load options on `GuideSupervision.guide_role`, so accessing `.guide_role.status` a few lines later triggered a lazy-load outside FastAPI's async context. Fixed by adding the same eager-load tuple already used elsewhere in the module. This is the same root-cause *pattern* as the Sprint 5-6 locations-hierarchy bug and the Sprint 7-8 stale-relationship bug — async SQLAlchemy relationship access always needs to be eager-loaded up front, there's no safe lazy fallback — but a distinct instance of it, not a repeat of either fix.

**New tables:** `guide_supervision`, `guide_assignments`, `guide_availability`, `business_referrals`. **Enum extensions:** 6 new `NotificationType` values (guide invite/accepted/ended/assigned, referral approved/rejected). One migration, applied to Neon.

**Frontend:** `/dashboard/guides` (Expert: invite, list guides, assign to a departure, cancel assignments), `/dashboard/guide` (Guide: respond to invites, availability, assignments, earnings), `/dashboard/business-network` (Expert: add + list referrals), `/admin/business-network` (admin approve/reject).

**Verified:** a full scripted smoke test against Neon covering the entire guide lifecycle (invite → duplicate-invite-rejected → accept → assign-before-approval-rejected → admin-approves-role → assign → check-in → complete → earnings-correct → second-assignment-cancelled-by-expert → availability-set-and-listed → supervision-terminated-by-guide → assign-after-termination-rejected-403) and the full business-network lifecycle (create → list-mine → admin-lists-pending → approve-with-notification → reject-with-reason-and-notification → re-approve-already-processed-rejected). Additionally verified at the HTTP layer end-to-end with fresh per-request sessions (the level that caught both bugs above), confirming every response shape matches the frontend's TypeScript types exactly, including the nested `guide`/`expert`/`departure` summary objects. Frontend `npm run lint` and `npm run build` both clean.

### Sprint 14-15 (Part 1 of 2) — Financial Engine & Trust Badges (Wk 27-30)

> User steered this sprint's order: Financial Engine + Trust Badges first (this section); Rent-a-Car module and the multi-service booking cart UI — both large, independent pieces — follow in a second pass.

| Task | Status |
|---|---|
| Advanced commission engine (category, partner-specific, referral/network) | Done — `CommissionRule` table with three scopes: CATEGORY (default per booking-item type, replacing the old hardcoded dict), PARTNER (override for one specific partner, optionally per item type), NETWORK (one platform-wide referral rate). "Referral" and "network" are treated as one concept here — see scope note below |
| Commission priority resolution | Done — PARTNER-scope (item-type-specific, then blanket) beats CATEGORY beats a hardcoded safety-net default. Every `Commission` row records which `CommissionRule` (if any) produced its rate, for traceability |
| Commission ledger | Done — the existing `Commission` table now doubles as the ledger: a `source` column (DIRECT vs NETWORK) means one booking item can generate two rows (the partner's own cut, plus a referring expert's cut), and a `payout_id` tracks which batch swept each row |
| Automated payout split calculation | Done — `GET /api/v1/admin/payouts/preview`: groups every currently-PAYABLE commission by partner and shows what a batch run would pay, without creating or mutating anything |
| Batch payout processing | Done — `POST /api/v1/admin/payouts/run`: sweeps PAYABLE commissions into one `Payout` per partner, marks them PAID, notifies each partner. Like every other financial feature so far (escrow release, dispute refunds), there's no real bank transfer behind this — a payout is marked paid immediately. Running it again with nothing payable creates nothing (verified) |
| Trust badges & certifications system | Done — 4 badge types: `verified`, `top_rated`, `couple_friendly`, `safety_certified`. Partners apply (with an optional private note), admin approves/rejects |
| Badge application, approval, auto-award | Done — application/approval workflow for 3 manually-applied types; `top_rated` is the one auto-awarded type, recomputed by `reviews/service.py` after every new review (≥4.5 average over ≥5 reviews auto-awards it; dropping back below auto-revokes it) |
| Couple-friendly, privacy-protected badge logic | Done — `couple_friendly` only applies to properties (validated server-side). "Privacy-protected": an applicant's `private_note` and any `rejection_reason` are never in the public-facing schema — `GET /api/v1/badges` (what a tour/property detail page shows) only ever returns the boolean fact that a badge is held. The applicant's *own* view (`GET /api/v1/badges/mine`) does include both fields, since privacy here means private from other people, not from the person who wrote it |
| Multi-service unified bookings | Done — see Part 2 below |
| Rent-a-Car module (vehicles, drivers, pricing, booking) | Done — see Part 2 below |
| Rent-a-Car dashboard | Done — see Part 2 below |

**Scope note ("referral" vs "network" commission):** the technical document lists both "referral" and "network" as commission types without defining a difference, and there's no infrastructure anywhere in the codebase for attributing a *traveler's* booking to a referral (no referral codes, no signup attribution) — building one now would be inventing a feature the doc never actually specifies. The only real "referral" concept that exists is Sprint 12-13's Business Network: a Local Expert refers a *business*. So "referral/network commission" here means exactly that: once an admin links an approved `BusinessReferral` to the referred business's actual `PartnerRole` (new `POST /api/v1/admin/business-network/{id}/link-partner`), every booking against that partner generates a second commission row crediting the referring expert, at the platform-wide NETWORK rate (seeded at 2%).

**Bugs found and fixed while writing this sprint's own migration** (all caught before reaching Neon, by actually running the migration rather than just reading the generated diff):
1. Alembic's `op.create_table` auto-creates a brand-new enum type for a column, but reusing an *existing* enum type (here, `taggable_entity_type` on the new `badges` table, and `booking_item_type` on the new `commission_rules` table) needs `create_type=False` or Postgres errors with "type already exists". Same root cause as the earlier `ALTER TYPE ... ADD VALUE` precedent (autogenerate doesn't reason about enum identity across tables) — a different manifestation of it, not a new bug class.
2. The reverse problem: `op.add_column` with a *brand-new* enum type (`commission_source`, added to the existing `commissions` table) does **not** auto-create the type the way `create_table` does — needs an explicit `CREATE TYPE` first.
3. Adding that new NOT NULL `source` column to `commissions` needed a `server_default` — there was already one real commission row in production (from the SSLCommerz test payment two sprints ago) that would otherwise have failed the migration.
4. Missed adding the 4 new `NotificationType` enum values in the same migration as the code that introduced them — a small follow-up migration fixed it. All caught by actually running the migration against Neon and reacting to the real errors, not by review alone.

**New tables:** `commission_rules`, `payouts`, `badges`. **Schema changes:** `commissions` gained `source`/`rule_id`/`payout_id` and lost its old one-row-per-booking-item unique constraint (replaced with one scoped to `booking_item_id`+`partner_role_id`+`source`, since a booking item can now generate two rows); `business_referrals` gained `linked_partner_role_id`. **Enum extensions:** `commission_status` gained `PAID`; 4 new `NotificationType` values. Two migrations (one for the schema, one follow-up for the missed notification enum values), both applied to Neon, with the default CATEGORY (10%/12%/10%) and NETWORK (2%) rules seeded as real rows so the engine is visibly configurable from day one rather than relying on invisible code fallbacks.

**Frontend:** `/admin/commission-rules` (view + create + deactivate rules), `/admin/payouts` (preview + run batch + history), `/admin/badges` (approve/reject, private note visible to admin only), `/admin/business-network` gained a "link to partner" action. `/dashboard/earnings` gained a paid-out total and payout history. A `BadgeApplications` component on the tour/property edit pages lets owners apply; a `TrustBadges` component on the public tour/property pages shows approved badges to travelers.

**Verified:** a comprehensive scripted smoke test against Neon covering the full lifecycle — category rate applies by default, a partner-specific rule correctly overrides it, linking an approved referral to a partner correctly generates a second NETWORK commission row at the right rate for the referrer, a payout batch correctly groups and pays out everyone owed money and marks their commissions PAID, running it again with nothing payable creates nothing, badge applications are correctly gated (owner-only, couple-friendly restricted to properties, top-rated rejected as manual), the public/private visibility split holds (private note invisible publicly, visible to the applicant and admin), and TOP_RATED auto-awards after 5 five-star reviews. Also verified at the HTTP layer (commission rule creation, badge apply/approve/public-list, payout preview/mine) confirming every response shape matches the frontend's TypeScript types exactly — including a real gap this caught and fixed: `/api/v1/badges/mine` was returning the public schema, which would have hidden an applicant's own rejection reason from them. Frontend `npm run lint` and `npm run build` both clean.

### Sprint 14-15 (Part 2 of 2) — Multi-Service Cart & Rent-a-Car (Wk 27-30)

| Task | Status |
|---|---|
| Multi-service unified bookings (cart) | Done — frontend-only, since the backend already accepted multi-item bookings. A zustand-persisted `useCartStore` collects tour/stay/vehicle items across separate detail pages; a `/cart` page checks them all out as one `POST /api/v1/bookings` call with one shared guest list, then continues into the existing SSLCommerz flow |
| Rent-a-Car module — vehicles, drivers, pricing, booking | Done — new `rentcar` module. `Vehicle` is the direct bookable unit (no separate type+pooled-units split like Stays — quantity is always 1); `VehicleAvailability` is a boolean-per-date calendar; `Driver` is a simple roster with manual per-vehicle assignment (no per-booking dispatch workflow) |
| Rent-a-Car dashboard | Done — `/dashboard/vehicles` (list/create/edit, submit for review, assign a driver, set destinations and availability), `/dashboard/drivers` (roster CRUD), `/admin/vehicles` (approval queue, mirrors tours/properties) |

**Scope trims (deliberate, consistent with this project's precedent of not building speculative generality):** no vehicle photos; no per-booking driver dispatch/assignment workflow (a driver is assigned to a vehicle, not booked per-trip); no traveler-referral-code system. `BookingItem.check_in_date`/`check_out_date` are reused as pickup/return dates rather than adding new columns.

**Integration points touched:** `bookings` gained `BookingItemType.VEHICLE_RENTAL` and a `vehicle_id` FK on `BookingItem`, plus `_reserve_vehicle`/`_release_vehicle` in `service.py` mirroring the Stays room-reservation logic (row-level locking via `with_for_update()`); `commissions` seeded a `VEHICLE_RENTAL` CATEGORY rule at 12% and added partner resolution via `Vehicle.rent_a_car_role_id`; `locations` gained `TaggableEntityType.VEHICLE`; `search` gained `GET /api/v1/search/vehicles` (date-range availability search) and a `published_vehicle_count` on destination summaries; `admin` gained the vehicle approval endpoints.

**New tables:** `drivers`, `vehicles`, `vehicle_availability`. **Enum extensions:** `taggable_entity_type` gained `VEHICLE`, `booking_item_type` gained `VEHICLE_RENTAL` (both via `ALTER TYPE ... ADD VALUE`, applied proactively using the `create_type=False`/two-migration lessons learned in Part 1 — no migration bugs hit this time on the first attempt). Two migrations applied to Neon: one for the schema (enum extensions + new tables + `vehicle_id` FK), and a required follow-up seeding the `VEHICLE_RENTAL` commission rule — Postgres disallows using a brand-new enum value in the same transaction that added it, so the rule seed couldn't be folded into the first migration.

**Verified:** a comprehensive scripted smoke test against Neon covering the full lifecycle — driver CRUD, vehicle draft → tag → submit → admin approve → appears in published search, date-range availability search finds/excludes it correctly, booking reserves it and removes it from search, a double-booking on the same dates is correctly rejected, a non-1 quantity is correctly rejected at the schema-validation layer, payment confirmation calculates commission at the correct 12% rate for the right partner, and cancellation releases the reserved dates back to availability. Also verified at the HTTP layer against a local server instance: public `GET /api/v1/vehicles` returns 200 unauthenticated, `POST /api/v1/vehicles` and `POST /api/v1/drivers` correctly return 401 unauthenticated, and the full route list matches what was built. The multi-service cart was verified with a real `POST /api/v1/bookings` carrying both a `tour_departure` and a `room_type` item in one call, producing the correctly summed `total_amount` and one `Booking` row with both items confirmed. Frontend `npm run lint` and `npm run build` both clean, with all new routes (`/cart`, `/rent-a-car`, `/rent-a-car/[id]`, `/dashboard/vehicles`, `/dashboard/vehicles/[id]`, `/dashboard/drivers`, `/admin/vehicles`) generated successfully. Both FastAPI Cloud and Vercel confirmed live with the new endpoints/pages responding correctly post-deploy.

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
| 13 | A Local Expert can add a Guide under supervision | Done — invite by email, guide accepts, admin approves the role, one supervisor per guide enforced at the DB level |
| 14 | A Local Expert can add a referred business | Done — `owned` or `referred` ownership types, admin approval workflow |
| 15 | Referral attribution is stored | Done — every `BusinessReferral` row carries `referring_expert_role_id` |
| 16 | Admin can manage disputes, refunds and payout holds | Done (basic) — a traveler opens a dispute, an admin resolves it as refunded (flips escrow to `REFUNDED`) or rejected with a note. No payout-hold mechanism yet since there's no payout/disbursement system at all in Phase 1 (that's Phase 2 "Financial Engine") — nothing to "hold" against. |
| 17 | Partners can purchase featured placement | Pending |
| 18 | Sponsored results are visibly labelled | Pending |
| 19 | All important Admin actions are audit logged | Done — role approve/reject, document verify/reject, tour/property approve/reject, dispute resolve, business referral approve/reject. Extend as each new admin action lands |
| 20 | Tour, stay and partner profiles cannot be published without location tags | Done — enforced server-side at submit time for both tours and properties (verified: submitting without a tag returns 409); partner-role profiles don't have a separate "publish" gate yet since they're not publicly browsable pages on their own outside search results |
