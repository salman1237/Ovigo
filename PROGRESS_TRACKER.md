# OVIGO — Progress Tracker

> Updated at the end of every sprint slice. Status values: `Not started` · `In progress` · `Done` · `Blocked`.
> See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for how we work, and
> [OVIGO_TECHNICAL_DOCUMENT.md](OVIGO_TECHNICAL_DOCUMENT.md) for full spec per sprint.

_Last updated: 2026-09-04 (Sprint 29-30 Part 1 complete — API Documentation for External Partners shipped)_

## Infrastructure & deployment status

| Item | Status | Notes |
|---|---|---|
| GitHub repo | Done | `salman1237/Ovigo`, connected |
| NeonDB | Done | Connection string configured in `backend/.env` (gitignored); 48 tables live — see Sprint 5-6 (13 tables), Sprint 7-8 (`bookings`, `booking_items`, `booking_guests`, `booking_status_history`, `payments`, `escrow_transactions`, `commissions`, `reviews`), Sprint 9 (`notifications`, `disputes`), Sprint 10-11 (`custom_tour_requests`, `tour_bids`), Sprint 12-13 (`guide_supervision`, `guide_assignments`, `guide_availability`, `business_referrals`), Sprint 14-15 Part 1 (`commission_rules`, `payouts`, `badges`), Sprint 14-15 Part 2 (`drivers`, `vehicles`, `vehicle_availability`), Sprint 16 Part 1 (`chat_threads`, `chat_attachments`, `chat_messages`) and Sprint 17-18 (`ad_campaigns`) additions below. Sprint 16 Part 2 (analytics + dispute payout holds) added no new tables — see that section |
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
| Room/unit management | Done — `room_types` per property (name, max occupancy, price, unit count) for booking-availability pooling; individual physical `Room` entities (housekeeping status, optional per-booking assignment) added in Sprint 19-20 Part 2 as an operational layer on top, without changing how availability itself is counted |
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

### Sprint 16 (Part 1 of 2) — Live Chat (Wk 31-32)

> This sprint was skipped over initially when Phase 2 work moved straight from Sprint 14-15 into Phase 3 planning — caught and corrected before Phase 3 started. Split the same way as Sprint 14-15: Part 1 (this section) is the WebSocket-based chat system itself; Part 2 (advanced partner analytics dashboards + a richer dispute-management system, including payout holds) follows separately.

| Task | Status |
|---|---|
| WebSocket-based live chat | Done — new `chat` module; first WebSocket infrastructure in this codebase (no prior real-time layer existed). REST persists every message and remains the source of truth; the WebSocket only pushes a live copy of what was just persisted, so a missed broadcast never loses a message |
| Pre-booking chat (with safety rules) | Done — a traveler can message a Local Expert/Host/Rent-a-Car partner about a Tour/Property/Vehicle before booking. Contact info (emails, phone numbers, URLs) is heuristically redacted from text messages, and attachments/location sharing are blocked outright |
| Post-booking chat (with attachments, location sharing) | Done — confirming a booking opens a *new* thread scoped to that specific `BookingItem` (a pre-booking inquiry never "graduates" into one) — attachments and location sharing unlock automatically because they're gated on `thread.booking_id` being set, and redaction turns off for the same reason |
| Chat moderation tools for admin | Done — a reported-message queue (`GET /admin/chat/threads?reported_only=true`), a required *logged* reason to view any thread's full history (every admin read is audit-logged, not just mutations — matches the technical document's "admin chat access logged" requirement), and the ability to close a thread |

**Scope trims (deliberate):** two participants per thread only, no group chat; no typing indicators; no message editing/deletion; a single `read_at` timestamp per message (fine since there are only ever two parties); attachments are images only, reusing `app.core.storage`'s existing validator rather than adding a new file-type allowlist; the WebSocket connection manager is in-process/single-instance only — a missed broadcast still shows up on next REST fetch, and horizontal scaling would need a Redis pub/sub fan-out layer, exactly the scaling note already in the technical document's own risk register.

**Design note (thread scoping):** a thread's context (TOUR/PROPERTY/VEHICLE vs. BOOKING_ITEM) is fixed for its whole life. This keeps the safety-rule boundary (redaction, no attachments/location pre-booking) a structural property of the thread — derived once from whether `booking_id` is set — rather than a flag that has to be toggled mid-conversation as a conversation "graduates" from inquiry to booking.

**New tables:** `chat_threads`, `chat_attachments`, `chat_messages`. **Enum extensions:** 2 new `NotificationType` values (`NEW_CHAT_MESSAGE`, `CHAT_MESSAGE_REPORTED`) via `ALTER TYPE ADD VALUE`. One migration, applied cleanly to Neon on the first attempt (all three new enum types — `chat_context_type`, `chat_thread_status`, `chat_message_type` — were genuinely new, so no `create_type=False` handling was needed).

**Frontend:** `/chat` (inbox, polled every 15s), `/chat/[id]` (thread view — text/location/attachment messages, a live WebSocket connection for real-time delivery, message reporting), a reusable `MessageButton` wired into the tour/stay/vehicle detail pages and each booking item on the booking detail page, `/admin/chat` (moderation queue with the logged-reason view-gate and close action), and a "Messages" header nav link with an unread-count badge.

**Verified:** a comprehensive scripted smoke test against Neon covering the full lifecycle — pre-booking thread creation, idempotent get-or-create, a partner blocked from messaging about their own listing, contact-info redaction firing pre-booking and *not* firing post-booking, location sharing and attachments correctly blocked pre-booking and allowed post-booking, unread counts and read receipts, message reporting, and the full admin moderation flow (reported-queue listing, logged-reason message view, closing a thread, and further messages to a closed thread being rejected). Also verified at the HTTP+WebSocket layer against a live local server — confirmed a message posted via REST is pushed to a connected WebSocket client in real time, and that connecting with an invalid token is correctly rejected at the handshake (HTTP 403, before `accept()`) rather than admitted and then dropped. Frontend `npm run lint` and `npm run build` both pass clean with all new routes generated; no browser-automation tool is available in this environment, so the UI itself was verified via the build/lint pass and the backend contract test rather than interactive browser testing.

### Sprint 16 (Part 2 of 2) — Advanced Analytics & Dispute Payout Holds (Wk 31-32)

| Task | Status |
|---|---|
| Advanced partner analytics dashboards | Done — new `analytics` module, `/dashboard/analytics` (recharts trend charts). Per approved role (Local Expert / Host / Rent-a-Car): a summary (bookings, gross/net revenue, average rating), a monthly revenue+bookings timeseries, and top listings by revenue. Built entirely from existing `Commission`/`BookingItem`/`Review` rows — no new tables |
| Dispute management system (richer) | Done — closes the remaining half of MVP AC #16 ("payout holds"). Either party to a booking (not just the traveler) can now raise a dispute; opening one freezes every `Commission` on the booking (new `ON_HOLD` status, verified to actually drop out of the payout batch preview); rejecting releases the hold, refunding cancels the commission outright (new `CANCELLED` status) |

**Also fixed in passing:** there was no `GET /api/v1/partners/earnings/vehicles` endpoint — Rent-a-Car partners had *no* earnings visibility at all before this. Added it alongside the new `/api/v1/partners/analytics/vehicles` endpoint, giving all three revenue-generating role types parity.

**Bug found and fixed (via this pass's own smoke test, not review alone):** the admin "new dispute" notification has linked to `/admin/disputes/None` since Sprint 9 — `dispute.id` was read for the notification link immediately after `db.add(dispute)`, before any flush, so the client-side UUID default hadn't been assigned yet. Fixed with an explicit `await db.flush()`.

**Scope trims:** dispute resolution stays binary (full refund or reject) — no partial-refund amount tracking, since escrow is a single HELD/REFUNDED flag per booking, not an amount-tracked ledger; no dedicated "disputes I'm involved in" list endpoint for partners yet — a partner is still notified in-app the moment a dispute opens or resolves on their booking (with no dead link, since there's no partner-facing "bookings against my listings" view to send them to), they just can't browse a history list of them yet; a `CUSTOM_BID` commission counts toward analytics totals but is left out of "top listings" since a one-off bid isn't a reusable listing to rank.

**Enum extensions:** `CommissionStatus` gained `ON_HOLD` and `CANCELLED` via `ALTER TYPE ADD VALUE`. One migration, applied cleanly to Neon. No new tables.

**Frontend:** `/dashboard/analytics` (role-tabbed summary stats + revenue/bookings charts + top listings, via `recharts`, newly added as a dependency); `/dashboard/earnings` gained an "on hold" stat and a third card for Rent-a-Car partners; `/admin/disputes` now shows a "traveler"/"partner" tag on who raised each dispute.

**Verified:** a comprehensive scripted smoke test against Neon covering the full lifecycle — analytics summary/timeseries/top-listings correctness after a completed booking, a review updating the average rating, a partner-raised dispute freezing the commission and being excluded from the payout preview, a second concurrent dispute on the same booking correctly rejected, a rejected dispute releasing the hold back to payable, a traveler-raised dispute resolved as refunded correctly cancelling the commission, and a non-party correctly denied at every step. Also verified at the HTTP layer that all new/changed endpoints correctly gate on auth (401 unauthenticated). Frontend `npm run lint` and `npm run build` both pass clean, with the new `/dashboard/analytics` route generated. Both FastAPI Cloud and Vercel confirmed live post-deploy. As with Sprint 16 Part 1, no browser-automation tool is available in this environment, so the UI was verified via the build/lint pass and the backend contract tests rather than interactive browser testing.

**Phase 2 ("Customization & Network") is now fully complete** — all of Sprint 10-11 through Sprint 16 (Parts 1 and 2) are shipped and deployed.

## Cross-Cutting: Full-Stack Audit & Complete Visual Redesign

Requested by the project owner after Phase 2 wrapped: the navbar and overall UI were called out as needing a full modern redesign, plus a fullstack engineering audit before Phase 3 begins. Not a technical-document sprint — a cross-cutting pass over every existing module.

**Audit method:** three research passes (frontend design-pattern survey, backend security/correctness/performance audit, frontend code-quality/UX audit) before any changes, to separate genuine issues from already-documented, deliberate trade-offs.

**Backend fixes applied:**
- The OTP `dev_code` was always echoed in `/verify-email/request` and `/verify-phone/request` responses regardless of environment, which would defeat OTP verification if shipped as-is — now gated behind `settings.environment != "production"`.
- `/verify-email/confirm` and `/verify-phone/confirm` had no rate limit unlike their `.../request` siblings (brute-forceable within the OTP TTL by an already-authenticated session) — added 10/minute limits matching the existing convention.

**Backend findings surfaced but deliberately deferred** (real, but a separate body of work from "redesign + audit," and not blocking Phase 3): near-zero backend test coverage relative to how much concurrency-sensitive logic exists in `bookings/service.py`; a few un-indexed FK columns on `booking_items`/`chat_messages`; a small N+1 in `guides/service.py::set_availability`; stale-but-pinned backend dependency versions (roughly a year behind current releases); `/auth/refresh` has no rate limit.

**Frontend redesign — new design system, applied to every page:**
- Blue/indigo gradient color system replacing the all-`zinc` palette (new `primary` color scale + gradient tokens in `globals.css`); fixed a real bug where the loaded Geist font was silently overridden by a hardcoded `font-family: Arial` on `body`.
- New shared `components/ui/` primitives (Button, Card, Input, Textarea, Select, Badge, Spinner, Skeleton, EmptyState, ErrorState, Popover) built on `class-variance-authority` + a `cn()` helper — every page migrated onto these instead of hand-rolled Tailwind classes duplicated per-file.
- Full Header rebuild: sticky blurred bar, gradient wordmark, a grouped "Dashboard" dropdown (replacing 9+ flat partner-tool nav links), a user menu dropdown, and a new Framer Motion slide-in mobile drawer — the single highest-priority finding was that the navbar had **zero mobile responsiveness** at all (no hamburger/drawer).
- Added `lucide-react` (icons, replacing raw inline SVGs and emoji), `framer-motion` (entrance/hover/drawer animations), `clsx` + `tailwind-merge` (the `cn()` helper), `class-variance-authority` (variant props).
- Every module migrated: homepage (gradient hero + feature cards), auth pages, all public browse/detail pages (tours/stays/rent-a-car), cart, bookings, chat (inbox + live thread), every partner dashboard page (tours/properties/vehicles/drivers/bids/guides/guide/business-network/earnings/analytics/profile), custom tour requests, and the full admin section (shell + 13 sub-pages).

**Frontend fixes applied alongside the redesign** (mechanical, high-value, done while touching each file anyway rather than as a separate pass):
- 44 form labels across 16 files were real `<label>` elements never linked via `htmlFor`/`id` (invisible to screen readers) — the new `Input`/`Textarea`/`Select` components wire this automatically via `useId()`, fixing every migrated form.
- Only 9 of 44 pages checked `isError` on their data queries — a real backend failure rendered identically to "no data." Added a shared `ErrorState` component and wired it into every list/detail page migrated.
- No `<main>` landmark existed anywhere in the app shell — added to the root layout.
- `NotificationBell.tsx` had one keyboard-inaccessible `<div onClick>` row — now a real `<button>`.
- `admin/commission-rules`' item-type dropdown was missing `vehicle_rental`, so an admin couldn't create a rule for that item type through the UI even though the backend and the seeded default rule already supported it.
- Rent-a-Car partners had no `/api/v1/partners/earnings/vehicles` endpoint at all until this pass (found while cross-checking `dashboard/earnings` against the backend) — added alongside the earlier Sprint 16 Part 2 analytics endpoint of the same shape.

**Verified:** `npm run lint` and `npm run build` both pass clean after every batch (9 batches total, each committed separately), all 38 routes generated throughout. Both FastAPI Cloud and Vercel confirmed live after each push, with a final spot-check across a representative page from every module returning `200`. No browser-automation tool is available in this environment, so interactive/visual verification (actually clicking through the new navbar, drawer, forms) was **not** performed — this was verified via successful builds and by reasoning about the emitted Tailwind classes, not a live QA pass. A manual click-through is recommended before treating this as fully done.

## Phase 3 — Growth & Monetization

### Sprint 17-18 — Advertising Platform (Wk 33-36)

| Task | Status |
|---|---|
| Ad product catalog (search, featured, banner, card, sponsored) | Done — `AdPlacementType` enum; a campaign picks one placement type as metadata, all placement types share the same underlying serving/billing mechanics |
| Campaign creation & management | Done — a partner picks one of their own already-published listings (Tour/Property/Vehicle) to promote; draft → pending_review → active/rejected → paused/completed lifecycle, mirroring the tours/properties/vehicles approval pattern |
| Location & audience targeting | Done for location — reuses the existing generic `location_tags` system via a new `TaggableEntityType.AD_CAMPAIGN` member rather than a new join table. No audience/demographic targeting — no traveler-profiling data model exists in this codebase to target against, and building one would be far outside this sprint's scope |
| CPC and CPM billing models | Done — CPC charges the bid amount per click; CPM charges bid/1,000 per impression. A campaign auto-completes once spend reaches its budget; the exhausting click/impression is still honored in full (not partially charged) since it already happened, so a small overshoot past the budget is expected, not a bug |
| Impression & click tracking | Done — aggregate counters (`impressions_count`/`clicks_count`) on the campaign row, not a per-event log, consistent with how commissions/payouts are running balances rather than transaction ledgers elsewhere in this codebase. Serving `GET /api/v1/ads/sponsored` for a destination *is* the impression — there's no separate client-side "mark as shown" call |
| Ad creative approval workflow | Done — admin approves/rejects the campaign itself (bid, budget, targeting). There's no separate creative-asset upload/review: a campaign promotes an existing listing whose content was already vetted when it was published, so a second creative-review pipeline would be reviewing the same content twice |
| Ad budget management & billing | Done, flag-only — `budget_total`/`budget_spent` are tracked internally, the same pattern already used for payouts and escrow release ("a payout is marked paid immediately"). No real payment-gateway integration for ad spend; a partner sets a budget and spend accrues against it, nothing moves money |
| Ad reporting dashboard (impressions, CTR, ROAS) | Done except ROAS — `/dashboard/ads/[id]` shows impressions, clicks, CTR and spend. ROAS needs click-to-booking attribution, which doesn't exist anywhere in this codebase and would be a significant feature on its own, not a reporting nicety — deliberately left out rather than faked |
| Sponsored result labeling in search | Done — a shared `SponsoredResults` component (highest-bid-first auction over active, in-window, under-budget campaigns for the searched destination) renders a labeled "Sponsored" section on the tours/stays/rent-a-car search pages, with click tracking, once a destination is searched |

**Closes MVP Acceptance Criteria #17 and #18** (see below) — the two remaining `Pending` rows from Phase 1.

**New table:** `ad_campaigns`. **Enum extension:** `TaggableEntityType` gained `AD_CAMPAIGN` via `ALTER TYPE ADD VALUE`. One migration, applied cleanly to Neon on the first attempt.

**Verified:** a comprehensive scripted smoke test against Neon covering the full lifecycle — ownership checks (can't advertise someone else's listing), submit-without-targeting rejected, admin approve/reject, sponsored-result serving with correct impression tracking (and correctly excluding wrong entity types, unapproved, paused and budget-exhausted campaigns), CPC click billing and budget-exhaustion auto-completion, CPM impression billing, pause/resume, and a lowered-budget-below-spend guard. Also verified at the HTTP layer: all 13 routes registered, auth gating correct on partner/admin endpoints, and the public sponsored/click endpoints respond correctly unauthenticated. Frontend `npm run lint` and `npm run build` both pass clean, all 40 routes generated. Both FastAPI Cloud and Vercel confirmed live post-deploy.

### Sprint 19-20 Part 1 — Advanced Pricing Engine (Wk 37-40)

Split the same way as Sprint 14-15 and 16: Part 1 (this section) is the pricing engine; Part 2 (staff accounts, front-desk booking mode, individual `Room`/housekeeping tracking, occupancy/ADR/RevPAR reporting) follows separately.

| Task | Status |
|---|---|
| Rate plans (seasonal/weekend/corporate/group) | Done — `RatePlan` model with a `rate_type` label plus generic qualifying conditions (date range, weekend flag, min-days-before-checkin, min-quantity); a plan applies purely from its own conditions, not from a hardcoded branch on `rate_type` — so "corporate" and "seasonal" behave identically given the same conditions, since no corporate-account/coupon gating exists in this codebase to key off of |
| Advanced pricing rules (early-bird, group discount, min stay) | Done for early-bird/group (both are just `RatePlan` rows using `min_days_before_checkin`/`min_quantity`). Min stay is a hard `RoomType.min_stay_nights` constraint enforced in the booking engine (rejects a too-short stay outright), not a discount condition — matches how real booking platforms treat it |
| Tax & service charge configuration | Done — per-property `tax_rate`/`service_charge_rate` percentages, computed on the room subtotal and tracked as a separate `Booking.tax_service_amount` (included in the traveler's total, excluded from `BookingItem.subtotal` so it doesn't inflate `Commission.gross_amount` — Ovigo doesn't take a cut of taxes/fees collected on a host's behalf) |
| Hotel/Resort multi-property management | Done via existing infra — a `PartnerRole` could already own unlimited `Property` rows with no uniqueness constraint; no new work needed |
| Bulk inventory management | Done via existing infra — `set_availability_range` already upserts a whole date range in one call; no new work needed |

**Conflict resolution:** when multiple rate plans qualify for the same night, the cheapest-applicable-plan wins (deterministic `min()` over every qualifying plan's adjusted price) rather than a fixed type-priority ladder the technical document never specifies. A per-date `AvailabilityCalendar.price_override` still always outranks every rate plan — a host who manually sets one date's price gets exactly that.

**New table:** `rate_plans`. **New enums:** `rate_plan_type`, `rate_plan_adjustment_type`. **New columns:** `properties.tax_rate`/`service_charge_rate`, `room_types.min_stay_nights`, `bookings.tax_service_amount` (`server_default='0'` for existing rows). One migration, applied cleanly to Neon.

**Verified:** a comprehensive scripted smoke test against Neon covering rate-plan CRUD and ownership checks, the "at least one condition" validator, cheapest-applicable-plan-wins resolution across weekend/early-bird scenarios, `min_stay_nights` rejecting a too-short booking, a manual `price_override` correctly outranking every rate plan on a real multi-night booking, tax/service-charge math, and confirming `BookingItem.subtotal` stays untouched by the tax/service charge (commission-basis integrity). Also verified at the HTTP layer: all 6 new routes registered and auth-gated (401 unauthenticated). Frontend adds rate-plan management, min-stay, and tax/service-charge rate UI to the property dashboard, plus a tax/service-charge line on the booking detail page; `npm run lint` and `npm run build` both pass clean, all 40 routes generated. Both FastAPI Cloud and Vercel confirmed live post-deploy (new endpoints spot-checked directly against the production backend's OpenAPI schema).

**Part 2 not yet started:** staff accounts with role-based permissions, front-desk booking mode, housekeeping status tracking (needs individual physical `Room` entities — `RoomType` currently only tracks pooled unit counts), and occupancy/ADR/RevPAR reporting extending the existing `analytics` module.

### Sprint 19-20 Part 2 — Hotel Operations (Wk 37-40)

| Task | Status |
|---|---|
| Staff accounts with role-based permissions | Done — `PropertyStaff` (three flat roles: `MANAGER`/`FRONT_DESK`/`HOUSEKEEPING`, `MANAGER` implies every permission). Invitation mirrors the existing Guide-invite pattern (`guides/service.py::invite_guide`): the invitee needs an existing Ovigo account, found by email, and a `PENDING` invite becomes `ACTIVE` only once they accept it. No admin-approval step, unlike a Guide role — staff access is internal to one host's own property, not a new public partner category. The owning host always has full access regardless of any `PropertyStaff` row |
| Front-desk booking mode | Done — a `FRONT_DESK`(or `MANAGER`)-permissioned staff member (or the owner) can create a walk-in booking that starts `CONFIRMED` and skips online payment entirely (paid in person); auto-creates a guest Ovigo account by email if one doesn't already exist. Staff-capable check-in/check-out endpoints reuse the same underlying transition logic as the existing traveler self-service check-in/out (refactored into shared private helpers so neither path drifts from the other) |
| Housekeeping status tracking | Done — new `Room` entities (physical rooms with a `room_number` and `housekeeping_status`: clean/dirty/cleaning-in-progress/out-of-order) sit as an operational layer on top of `RoomType.total_units`, which stays the sole source of truth for booking availability (unchanged). A `Room` can optionally be assigned to a booking at check-in (`BookingItem.assigned_room_id`) and automatically flips to dirty when that booking is checked out |
| Occupancy & ADR/RevPAR reports | Done — added to the existing `analytics` module as `GET /api/v1/partners/analytics/host/occupancy`. Available room-nights use each room type's configured unit count × days-in-range (theoretical capacity, not day-by-day `AvailabilityCalendar` overrides); booked room-nights/revenue are bucketed by a booking item's check-in date falling in the requested range (full stay counted in full) — the same "reporting KPI, not a certified ledger" approximation this module's monthly timeseries already uses |

**New tables:** `property_staff`, `rooms`. **New enums:** `staff_role`, `staff_status`, `housekeeping_status`. **New column:** `booking_items.assigned_room_id` (nullable FK to `rooms`, `ON DELETE SET NULL`). **Enum extension:** `notification_type` gained `STAFF_INVITE` via `ALTER TYPE ADD VALUE`. One migration, applied cleanly to Neon.

**Verified:** a comprehensive scripted smoke test against Neon covering the full staff permission matrix (a pending invite has no access yet, `MANAGER` implies every permission, `HOUSEKEEPING` staff correctly denied a front-desk-only action, revoked staff correctly lose access, a non-owner can't invite staff on someone else's property), Room CRUD, and a full front-desk booking lifecycle (walk-in booking created directly as `CONFIRMED` with an auto-created guest account → room assigned → checked in → checked out → the assigned room auto-flips to `DIRTY`), plus occupancy/ADR/RevPAR math against a real booking. Also verified at the HTTP layer: all 12 new routes registered and auth-gated (401 unauthenticated), with no new duplicate-operation-ID warnings introduced. Frontend adds a Staff and a Rooms & Housekeeping section to the property dashboard, a dedicated `/dashboard/properties/[id]/front-desk` page (walk-in booking form, check-in/check-out, room assignment), a `/dashboard/staff` "my invitations" page (linked from the header/mobile nav), and an occupancy/ADR/RevPAR widget on the host analytics tab; `npm run lint` and `npm run build` both pass clean, all 41 routes generated. Both FastAPI Cloud and Vercel confirmed live post-deploy (new endpoints and pages spot-checked directly against production).

**Sprint 19-20 ("Hotel Features & Advanced Pricing") is now fully complete** — Parts 1 and 2 both shipped and deployed. Phase 3 continues with Sprint 21-22 (Fraud, Risk & Smart Search) next.

### Sprint 21-22 Part 1 — Fraud & Risk Engine (Wk 41-44)

Split into two parts given the sprint's breadth: Part 1 (this section) is the fraud/risk engine; Part 2 (smart search ranking, notification templates/campaigns, admin reports) follows separately.

| Task | Status |
|---|---|
| Fraud scoring engine | Done — a user's risk score is never a stored column; it's `sum(score)` over that user's OPEN `FraudFlag` rows, computed on read (the same derive-don't-store convention analytics/commissions already use) |
| Risk rules (duplicate accounts, fake bookings, self-referral, etc.) | Done, scoped to signals this schema can actually verify — no device fingerprint, IP, or geolocation data is collected anywhere in this codebase, so rules are built on the existing `PartnerRole → PartnerAccount → User` ownership chain instead: `self_booking` (a partner booking their own listing), `self_review` (reviewing their own listing), `self_referral` (a business referral that resolves to the referrer's own second partner account once linked), `rapid_cancellation_pattern` (3+ cancelled bookings by the same user in 7 days), and `duplicate_identity_document` (byte-identical ID documents uploaded under different accounts) |
| Automated fraud alerts | Done for four of the five rules — `self_booking`/`self_review`/`self_referral`/`rapid_cancellation_pattern` fire automatically inline at the point of the triggering action (booking creation/cancellation, review creation, referral linking), not on a delay or a batch job. `duplicate_identity_document` is the one rule that's inherently cross-account (comparing every partner's uploaded document against every other's) rather than reactable to a single event, so it stays an admin-triggered scan (`POST /api/v1/admin/fraud/scan-documents`) instead. Every HIGH/CRITICAL flag fans out a notification to all admins, reusing the exact admin-alert pattern `disputes/service.py` already established |

**New table:** `fraud_flags`. **Enum extension:** `notification_type` gained `FRAUD_ALERT` via `ALTER TYPE ADD VALUE`. One migration, applied cleanly to Neon.

**Verified:** a comprehensive scripted smoke test against Neon covering all five rules firing correctly (plus a no-false-positive check for a normal traveler booking), risk-score aggregation counting only OPEN flags, a resolved flag correctly dropping out of the score, the document scan being idempotent on re-run, and HIGH/CRITICAL flags correctly generating an admin notification. Also verified at the HTTP layer: all 5 new admin routes registered and auth-gated (401 unauthenticated), no new duplicate-operation-ID warnings. Frontend adds an `/admin/fraud` dashboard (tabbed by status, severity-colored, resolve/dismiss with a note, manual document-scan trigger), linked from the admin nav; `npm run lint` and `npm run build` both pass clean, all 42 routes generated. Both FastAPI Cloud and Vercel confirmed live post-deploy.

### Sprint 21-22 Part 2a — Smart Search Ranking (Wk 41-44)

| Task | Status |
|---|---|
| Smart search ranking algorithm | Done — a shared composite score (`app/core/ranking.py`) replaces `created_at desc` ordering across every public listing surface: tours, stays (`search_stays`), rent-a-car (both its own public list and `search_vehicles`), and expert search |
| Search ranking factors (relevance, rating, conversion, completeness) | Done, each reinterpreted to what this schema can actually compute — no free-text query exists anywhere in this codebase (search is location-tag + date filtered only), so **relevance** means exact-location-tag match vs. subtree-only match rather than text relevance; **rating** is neutral (not penalized) wherever no review data exists for that listing/type, since e.g. `Review` has no `vehicle_id` column at all — rent-a-car ranking runs on relevance/conversion/completeness only; **conversion** is each listing's own completed-booking count, smoothed via `count/(count+5)` so one high-volume listing can't collapse everyone else's score; **completeness** is the fraction of a curated set of profile/listing fields actually filled in. Weights are a documented starting judgment call (no click/booking-attribution telemetry exists yet to tune against) |

**Bug fix found via this work's own HTTP-level verification** (unrelated to ranking itself, fixed alongside it): `GET /api/v1/search/stays` had been returning a 500 for any published property since it never eager-loaded `images`, which `PropertyRead`'s response serialization needs.

**No schema changes** — ranking is computed at query time from existing tables.

**Verified:** against Neon, a "rich" listing (complete profile, a real rating, a completed booking, exact location match) correctly outranks a "poor" one (bare minimum, no reviews/bookings, descendant-only match) across all four listing types. Also verified at the HTTP layer that every affected endpoint responds 200 with no new duplicate-operation-ID warnings. No frontend changes needed — pages already render whatever order the backend returns; `npm run lint` and `npm run build` re-verified clean regardless. Both FastAPI Cloud and Vercel confirmed live post-deploy.

### Sprint 21-22 Part 2b — Notification Campaigns & Admin Reports (Wk 41-44)

| Task | Status |
|---|---|
| Notification system expansion (push, SMS) | Not done — delivery itself needs a provider credential (SendGrid/SES, Twilio, FCM) that isn't configured anywhere in this codebase, the same gap `notifications/models.py` already documented for email. Scoped down to the in-app delivery this codebase actually has |
| Notification templates & campaign tools | Done — `NotificationTemplate` (reusable subject/body) and `NotificationCampaign` (admin-triggered broadcast to everyone, travelers with no partner account, or partners optionally narrowed by role type). Delivers through the same in-app `Notification` rows every other notification uses; a campaign's title/message are snapshotted from the template at send time so editing/deleting it later never changes what a past campaign is recorded as having sent |
| Emergency alerts | Done as a display flag only (`is_urgent`) surfaced in the campaign UI, not a real out-of-band emergency channel — there's no push/SMS transport to make it a genuine emergency broadcast (see notification expansion row above) |
| Advanced Admin reports (20+ report types) | Done, scoped down to 7 curated reports (bookings summary, platform revenue, partner performance, fraud overview, dispute overview, referral overview, partner-approval funnel) built from data this codebase already has — a deliberate reduction from "20+", since fabricating superficial reports with no real signal would be worse than a smaller set of genuinely useful ones. Each is exposed as JSON (dashboard table) and CSV (export) from the same query |

**New tables:** `notification_templates`, `notification_campaigns`. **Enum extension:** `notification_type` gained `ADMIN_ANNOUNCEMENT` via `ALTER TYPE ADD VALUE`. One migration, applied cleanly to Neon.

**Verified:** a comprehensive scripted smoke test against Neon covering template CRUD, campaign validation (needs a template or an ad-hoc title+message; `audience_role_type` only valid with `partners_only`), all three audience types resolving to the correct recipients (including a `partners_only` + role-type filter narrowing to exactly the right partner), a deleted template correctly leaving a sent campaign's snapshot intact, and all 7 reports running correctly with working CSV rendering. Also verified at the HTTP layer: all 10 new admin routes registered and auth-gated (401 unauthenticated), no new duplicate-operation-ID warnings. Frontend adds an `/admin/notifications` page (send/templates/history tabs) and an `/admin/reports` page (tabbed report viewer with CSV export); `npm run lint` and `npm run build` both pass clean, all 44 routes generated. Both FastAPI Cloud and Vercel confirmed live post-deploy.

**Sprint 21-22 ("Fraud, Risk & Smart Search") is now fully complete** — Part 1 (fraud & risk engine) and Part 2 (smart search ranking + notification campaigns/admin reports) both shipped and deployed. This closes out Phase 3 ("Growth & Monetization") per the technical document's phase plan; Phase 4 ("Scale & Expansion") is next.

## Phase 4 — Scale & Expansion

### Sprint 23-24 Part 1 — iCal Sync for Stays (Wk 45-48)

Split given the sprint's breadth: Part 1 (this section) is iCal import/export; Part 2 (channel manager / PMS integration API, additional payment gateways) follows separately.

| Task | Status |
|---|---|
| iCal import/export for stays | Done — a per-`RoomType` `.ics` export feed plus external-calendar import, both built on a hand-rolled RFC 5545 reader/writer (`app/core/ical.py`) rather than a new dependency, since the only need is VEVENT date ranges, not the full iCalendar spec |
| External calendar sync | Done via the same import feature — a host pastes an external platform's (Airbnb/Booking.com) calendar export URL and Ovigo blocks those dates to prevent double-booking |
| Channel manager integration API | Not yet started |
| PMS integration hooks | Not yet started |
| Additional payment gateways (Stripe, cards, bank transfer) | Bank transfer done (Part 2a, below); Stripe/cards still blocked on a real provider credential not configured anywhere in this codebase (the same gap already documented for email/SMS/push) |

**Design:** the export feed is gated by a random unguessable token generated lazily on first request (not a JWT) — matching exactly how Airbnb/Booking.com/Google Calendar's own "secret calendar URL" links work, since the consumer is a third-party calendar app that can't send an Ovigo bearer token; a host can regenerate it to invalidate a leaked link. Import always blocks the full date range at `available_units=0` regardless of `RoomType.total_units` — correct for this feature's target case (one external OTA listing synced to one Ovigo room type) and documented as a scope trim rather than building partial-unit conflict resolution.

**New column:** `room_types.ical_token` (nullable, unique). No enum changes. One migration, applied cleanly to Neon.

**Verified:** a comprehensive scripted smoke test against Neon covering the pure RFC 5545 build/parse round-trip (including line-folding), lazy token creation being idempotent, a non-owner denied both token access and import, export correctly including confirmed bookings while excluding pending-payment ones, token regeneration correctly invalidating the old feed URL, and import correctly blocking the right dates. Also verified at the HTTP layer: all 4 new routes registered, owner endpoints 401 unauthenticated, the public feed 404s on a wrong token, no new duplicate-operation-ID warnings. Frontend adds a "Calendar sync" section to the property dashboard (copyable feed link, regenerate, import-by-URL); `npm run lint` and `npm run build` both pass clean, all 44 routes generated. Both FastAPI Cloud and Vercel confirmed live post-deploy.

### Sprint 23-24 Part 2a — Bank Transfer Payment Method (Wk 45-48)

| Task | Status |
|---|---|
| Bank transfer as a payment method | Done — `BANK_TRANSFER` added as a second `PaymentProvider`. Manual/offline by nature: the traveler is shown Ovigo's transfer instructions, makes the transfer outside the platform, records the reference number, and an admin verifies it arrived before the booking confirms |

**Design:** `payments/service.py` was refactored to extract `_activate_booking` (confirm booking, open escrow, create commission, notify) out of `_confirm_payment` so both the SSLCommerz gateway-callback path and the new admin-verified bank-transfer path share identical confirmation logic rather than duplicating it.

**New column:** `payments.bank_reference`. **Enum extension:** `payment_provider` gained `BANK_TRANSFER`. One migration, applied cleanly to Neon.

**Verified:** a comprehensive scripted smoke test against Neon covering initiate → submit reference → admin verify (identical outcome to the SSLCommerz path: booking confirmed, escrow opened, commission created), a non-owner denied submitting someone else's reference, resubmitting a reference before verification allowed (fix a typo) but rejected after verification, re-verifying an already-validated payment rejected, and the reject flow correctly failing the payment and cancelling the booking. Also verified at the HTTP layer: all 5 new routes registered, auth-gated, no new duplicate-operation-ID warnings. Frontend adds a "Pay by bank transfer" flow to the booking detail page and a "Pending Bank Transfers" verify/reject panel to the admin payments page.

**Channel manager integration API and PMS integration hooks remain not started** — the natural next slice of Sprint 23-24 (an API-key-authenticated integration surface external systems could call to push/pull availability and rates), not yet designed.

### Sprint 25-26 Part 1 — Multi-Currency Display & International Destinations (Wk 49-52)

| Task | Status |
|---|---|
| Multi-currency support | Done as **display only** — every booking still settles in BDT via SSLCommerz, which has no real multi-currency settlement path, and no other gateway credential exists to change that (same "provider not configured" gap as Stripe/SMS/email/push). A traveler picks a display currency from the header; listing cards, detail pages, cart, and booking totals show an "≈ $12.34" hint alongside the real BDT price |
| International destination support | Done — proven with genuine seed data (Thailand/Bangkok/Phuket, India/Kolkata/Darjeeling), not a schema change. The `Location` model was always a country-agnostic self-referential tree; audited for and found no hardcoded Bangladesh-only assumptions elsewhere (phone validation, etc.) |
| Multilingual interface (i18n) | Not yet started |
| Translation-assisted chat | Not yet started — but *not* blocked on a missing credential like the items above: `api.mymemory.translated.net` is a genuinely free, keyless translation API confirmed working for English↔Bengali, so this is buildable in a later slice |
| Dynamic packaging | Not yet started |
| Smart recommendations engine | Not yet started |

**Design:** live FX rates come from `open.er-api.com` (free, keyless, and — unlike Frankfurter, which only tracks ECB-listed currencies — one of the few free FX APIs that actually supports BDT as a base currency), cached 6h via the existing in-process TTL cache (`core/cache.py`). A failed fetch degrades to no conversion hint shown, never a broken page.

**No new tables** — FX rates aren't persisted; the location seed script only adds rows (idempotent, skips existing slugs by design).

**Verified:** the live FX endpoint returns real current rates; the seeded international locations appear correctly in the existing locations-hierarchy endpoint (proving the tree is genuinely country-agnostic, not just in theory). `npm run lint` and `npm run build` both pass clean, all 44 routes generated. Both the Dokploy backend and Vercel frontend confirmed live post-deploy (GitHub Actions → Dokploy auto-deploy verified green).

### Sprint 25-26 Part 2a — Dynamic Packaging (Bundle Discount) (Wk 49-52)

| Task | Status |
| --- | --- |
| Bundle-eligible item types (tour departure, room type, vehicle rental) | Done |
| Discount tiers: 2 distinct types → 5% off, 3 distinct types → 10% off | Done |
| `bookings.bundle_discount_amount` column + migration | Done |
| `create_booking` computes and applies the discount at checkout | Done |
| Cart page: live discount preview banner + strikethrough total | Done |
| Booking detail page: discount line item | Done |

**Design:** the discount is subtracted only from `Booking.total_amount`, never from any `BookingItem.subtotal`. This preserves the commission-basis-integrity rule established earlier this project (taxes/service charges added, and now bundle discounts subtracted, both bypass `subtotal`): `Commission.gross_amount` is always computed on the full undiscounted subtotal, so partners are paid in full regardless of the promotion, and Ovigo's own commission margin absorbs the discount's cost. The discount rate is keyed off the count of *distinct* bundle-eligible item types in the booking (not raw item count), so two room bookings of the same type never trigger it — only genuinely combining different service categories does.

**New column:** `bookings.bundle_discount_amount` (`Numeric(10,2)`, default `0`) — added via migration `0efda2ae6204` with an explicit `server_default='0'` (required for a NOT NULL column against a table with existing rows, per the Alembic lesson learned earlier this project). Applied successfully to Neon.

**Verified:** a Neon smoke test covering single-type (no discount), two-type (5% off, tour+room), and three-type (10% off, tour+room+vehicle) bookings — confirming exact discount amounts, that every `BookingItem.subtotal` stays at full price, that a same-type-only booking with `quantity > 1` never triggers a discount, and that `Commission.gross_amount` for all three items matches the full undiscounted subtotal after walking a real booking through check-in/check-out. Frontend cart page shows a live discount-eligibility banner as items are added and a strikethrough-total view once eligible; booking detail page shows the applied discount line. `npm run lint` and `npm run build` both pass clean, all 44 routes generated. Both the Dokploy backend and Vercel frontend confirmed live post-deploy.

### Sprint 25-26 Part 2b — Smart Recommendations Engine (Wk 49-52)

| Task | Status |
| --- | --- |
| Content-based "similar listings" (tours, properties, vehicles) | Done |
| Collaborative "frequently booked together" (real booking co-occurrence) | Done |
| `GET /{id}/similar` and `GET /{id}/frequently-booked-with` on all three listing routers | Done |
| Surfaced on tour/stay/vehicle public detail pages | Done |

**Design:** two independent, deterministic strategies — no ML model and no click/impression telemetry exist yet, the same "starting judgment call, not tuned against real usage data" precedent `core/ranking.py` already set for search ranking. **Similar listings** (`similar_tours`/`similar_properties`/`similar_vehicles`, added next to each module's existing rating/conversion helpers in its own `service.py`) scores other PUBLISHED listings sharing at least one location tag by price closeness to the source listing, plus a same-category bonus for properties/vehicles (tours have no category field). **Frequently booked together** (new `app/core/recommendations.py`, kept central rather than in any one module since it has to resolve `BookingItem` rows across all three item types at once) counts genuine co-occurrence: which other tours/properties/vehicles actually shipped in the same `Booking`, restricted to `BookingItemStatus.COMPLETED` — the same trust bar `core/ranking.py`'s own conversion signal uses, so a pending or cancelled booking never inflates a pairing.

**No new tables or migrations** — both strategies are computed on read from existing `LocationTag`/`BookingItem` data, nothing persisted.

**Verified:** a Neon smoke test seeded three tours, three properties, and three vehicles at one shared location with deliberately-spread prices/categories, confirming `similar_*` always excludes the source listing and ranks the closer-priced/same-category candidate first; then booked a tour + a room type together twice (and a third, unrelated tour alone) through the full check-in/check-out lifecycle, confirming `frequently_booked_with_tour`/`frequently_booked_with_property` correctly surface each other, the unrelated booking never leaks in, and a listing with zero completed bookings returns an empty list rather than erroring. Confirmed all six new routes (`/similar` and `/frequently-booked-with` on tours/properties/vehicles) are registered in the live app and present in the production OpenAPI schema. `npm run lint` and `npm run build` both pass clean, all 44 routes generated. Both the Dokploy backend and Vercel frontend confirmed live post-deploy.

### Sprint 25-26 Part 3 — Translation-Assisted Chat (Wk 49-52)

| Task | Status |
| --- | --- |
| `POST /api/v1/chat/translate` (English <-> Bengali, on-demand) | Done |
| Per-message "EN" / "বাং" translate buttons in the chat UI | Done |

**Design:** uses `api.mymemory.translated.net` — a free, keyless translation API validated working for English<->Bengali earlier this sprint — via a new `core/translate.py` mirroring `core/fx.py`'s graceful-degradation shape (returns `None` on any failure rather than raising, so a translation hiccup never breaks the chat). Deliberately scoped to Ovigo's two primary languages only, not "translate to any language": the traveler base is overwhelmingly Bangladesh-based (Bengali) or international (English), and a bounded two-button toggle avoids needing a source-language auto-detection step this free API doesn't reliably offer. Translation is on-demand per message click, never persisted or auto-triggered on load — keeps volume well within MyMemory's free anonymous quota and keeps the original message the single source of truth.

**No new tables or migrations.**

**Verified:** `core/translate.py::translate_text` called directly against the live MyMemory API for both directions (English->Bengali and Bengali->English), confirming correct translations and a graceful `None` for empty input. Confirmed `POST /api/v1/chat/translate` is registered on the live app and reachable in production. `npm run lint` and `npm run build` both pass clean, all 44 routes generated. Both the Dokploy backend and Vercel frontend confirmed live post-deploy.

### Sprint 25-26 — scope decision: full multilingual (Bengali) UI translation

Explicitly deferred, not attempted. A full multilingual interface would mean adopting locale-prefixed routing (e.g. `next-intl` with `/en`/`/bn` URL segments) across all 44 routes and re-copy every page — a routing-structure change to the whole app, not an additive feature like the three slices above, with real risk to every existing internal `Link` and bookmarked/shared URL. Presented to the user as a choice (bounded first pass vs. full app vs. skip); the user chose to skip it and close out Sprint 25-26 with multi-currency + smart recommendations + translation-assisted chat as the "Internationalization & Personalization" deliverables. Revisit only if asked — see [OVIGO_TECHNICAL_DOCUMENT.md](OVIGO_TECHNICAL_DOCUMENT.md) for the original full-i18n scope if that happens.

## Phase 4 — Sprint 27-28 (Loyalty, Mobile & Platform Maturity)

### Sprint 27-28 Part 1 — Loyalty Wallet & Promotional Credit System (Wk 53-56)

User explicitly selected these 3 items from the sprint's full deliverable list to build now: loyalty wallet & reward points, promotional credit system, and (separately — see the next section) an Elasticsearch migration for search. Split, not attempted: promotional credit split payment between travelers, React Native/Flutter mobile app foundation, ML-based advanced personalization, and horizontal scaling architecture review — not requested, remain **Not started**.

| Task | Status |
|---|---|
| Loyalty wallet: earn points on completed bookings | Done |
| Loyalty wallet: redeem points for a BDT discount at checkout | Done |
| Loyalty wallet: refund points on booking cancellation | Done |
| Promotional credit system: admin-issued percentage/fixed-amount codes | Done |
| Promo codes: total + per-user redemption caps, expiry, deactivation | Done |
| `GET /api/v1/loyalty/me`, `GET /api/v1/loyalty/transactions` | Done |
| `GET /api/v1/promotions/validate/{code}`, admin CRUD under `/api/v1/admin/promotions` | Done |
| Cart page: promo code + points redemption inputs with live discount preview | Done |
| New `/account/loyalty` page (balance + history), `/admin/promotions` page | Done |

**Design:** both discounts follow the exact commission-basis-integrity rule already established for `bundle_discount_amount`/`tax_service_amount` — subtracted from `Booking.total_amount` only, never `BookingItem.subtotal`, so partners are paid in full and Ovigo's own margin absorbs the cost. They stack with the bundle discount and each other in checkout order: bundle discount first, then promo code (on the bundle-discounted total), then loyalty points (on the further-discounted total) — each capped so the running total can never go negative.

Loyalty points are earned at 1 point per ৳100 spent (floored) on a booking that reaches `COMPLETED`, and redeemable 1:1 for ৳1 off — a simple, symmetric ~1% cashback-in-points program, not tuned against real usage data (same "starting judgment call" precedent as `core/ranking.py`'s weights). Redemption is modeled exactly like inventory reservation elsewhere in this codebase: points are deducted when the booking is created and **refunded if it's later cancelled**, since they're the traveler's own previously-earned balance.

Promo codes are deliberately asymmetric: a redemption is **never refunded on cancellation** — unlike loyalty points, a promo code is a scarce, admin-controlled resource (often with a hard `max_redemptions` cap), and refunding on cancel would open a trivial book-cancel-rebook loop to reuse a one-time code indefinitely.

**New tables:** `loyalty_accounts` (one per user, denormalized `points_balance`), `loyalty_transactions` (append-only ledger — the real source of truth for every balance change), `promo_codes`, `promo_redemptions` (unique per `promo_code_id`+`booking_id`, also used to enforce the per-user cap). **New columns:** `bookings.loyalty_discount_amount`, `bookings.promo_discount_amount` (both `Numeric(10,2)`, `server_default='0'`). One migration (`5136324a57a0`), applied cleanly to Neon.

**Verified:** a Neon smoke test covering — a zero-balance redemption attempt correctly rejected; a completed 1000-BDT booking correctly earning 10 points; redeeming 6 points for a ৳6 discount on a second booking; cancelling that booking correctly refunding the 6 points; a 10%-off promo code correctly discounting a third booking by ৳100; reusing that same single-use-per-user code correctly rejected; the promo redemption correctly staying consumed even after its booking was cancelled (the deliberate asymmetry with loyalty points); and a deactivated promo code correctly rejected. Also verified at the HTTP layer: all 6 new routes registered on the live app and present in the production OpenAPI schema. `npm run lint` and `npm run build` both pass clean, all 46 routes generated. Both the Dokploy backend and Vercel frontend confirmed live post-deploy.

### Sprint 27-28 Part 2 — Elasticsearch-Backed Free-Text Search (Wk 53-56)

The user's third selected item. Before this, `core/ranking.py`'s own docstring noted "no free-text query exists anywhere in this codebase" — every search surface was location-tag (and, for stays/vehicles, date-range) filtered only, never a typed keyword.

| Task | Status |
|---|---|
| Single-node Elasticsearch deployed on the Dokploy VPS | Done |
| `core/search_engine.py` — indexing + search client, graceful degradation | Done |
| Free-text `q` param on tours, properties (`/api/v1/search/stays`), vehicles | Done |
| Incremental indexing on publish (admin approval) and on edit | Done |
| One-time backfill script (`scripts/reindex_search.py`) for pre-existing listings | Done |
| Keyword search inputs on the Tours, Stays, and Rent-a-Car pages | Done |

**Infrastructure:** a single-node Elasticsearch 8.15.0 container (`ovigo-elasticsearch`), deployed directly via `docker run` (not through Dokploy's own UI/API — it's a data store, not a git-built app, so this was the more direct path) onto the same VPS, attached to `dokploy-network` so the backend reaches it over Docker's internal DNS at `http://ovigo-elasticsearch:9200` — no public port exposure, no credentials (`xpack.security.enabled=false`, safe only because it's unreachable from outside the Docker network). `restart unless-stopped` and a named volume (`ovigo-es-data`) survive a VPS reboot. The VPS had 12GB of its 15GB RAM free before this (confirmed via SSH) — a 512MB-1GB JVM heap leaves ample headroom alongside the backend and other apps already running there.

**Design:** one index per listing type (`ovigo_tours`/`ovigo_properties`/`ovigo_vehicles`) rather than a unified index, matching each module's existing service.py/router.py boundary. Every search call and indexing call swallows connection errors and returns `None`/no-ops rather than raising — the exact same graceful-degradation shape already established by `core/fx.py` and `core/translate.py`. A search with Elasticsearch unreachable doesn't drop the filter entirely: it falls back to a plain Postgres `ILIKE` substring match, so a traveler always gets *some* text-filtered result, just with degraded relevance. A text match **filters** which listings get scored — it does not feed into `core/ranking.py`'s composite score itself; ordering among matches is still relevance/rating/conversion/completeness as before. Indexing is incremental (hooked into `admin/service.py`'s three `approve_*` functions and each module's `update_*`), not read-time; the backfill script is a one-time catch-up for anything published before this feature shipped.

**Known scope trim:** the default Elasticsearch analyzer keeps a possessive like "Cox's" as one token, so a bare query for `cox` won't match "Cox's Bazar..." (fuzziness AUTO's edit-distance budget isn't enough to bridge the apostrophe+s) — `bazar`, `sunset`, or any other whole word in the same title matches correctly. A custom analyzer (word-delimiter filter) would fix this but wasn't worth the added indexing complexity for what's a minor, narrow edge case; noted here rather than silently left undiscovered.

**Verified:** a Neon + production-Elasticsearch smoke test (via an SSH tunnel to the VPS's loopback-bound ES port) confirming a "mangrove" query matches only the tour whose description mentions it, a "trekking hills" query matches only the other, a nonsense query correctly returns an empty list (not `None` — a real zero-result search, distinguishable from "search unavailable"), `list_published_tours(q=...)` correctly filters at the service layer, and — with a broken Elasticsearch client injected directly — `search_tour_ids` correctly returns `None` and `list_published_tours` correctly falls back to its Postgres ILIKE path instead of raising or silently dropping the filter. Ran the backfill script against the real production database and Elasticsearch, then verified end-to-end on the live API (`https://ovigo-api.salmandev.io/api/v1/tours?q=sunset` correctly returning the one real published tour matching it). `npm run lint` and `npm run build` both pass clean, all 46 routes generated. Both the Dokploy backend and Vercel frontend confirmed live post-deploy.

## Phase 4 — Sprint 29-30 (Hardening & Optimization)

### Sprint 29-30 Part 1 — API Documentation for External Partners (Wk 57-60)

User explicitly picked this single item from the sprint's full list. Not attempted: load testing & performance tuning, security audit & penetration testing, GDPR/privacy compliance review, disaster recovery setup, general internal documentation/knowledge base — all remain **Not started**.

| Task | Status |
|---|---|
| `API_DOCUMENTATION.md` — external-partner guide (auth, conventions, endpoint map, gaps) | Done |
| `/partner-docs` — Swagger UI scoped to partner-relevant endpoints only | Done |
| `/api/v1/partner-docs/openapi.json` — the same schema, machine-readable | Done |
| `OPENAPI_TAGS` — real descriptions for every public/partner-facing tag | Done |
| Fixed stale "FastAPI Cloud only" hosting claim in both README.md files | Done |

**Design:** `/docs` (FastAPI's default, unchanged) still shows the entire schema, admin/internal endpoints included — useful for anyone working on this codebase. `/partner-docs` is a second, filtered Swagger UI built from the same `app.routes`, with every path under `/api/v1/admin/...` or `/api/v1/properties/{id}/front-desk/...` stripped out before rendering — filtered by **path prefix, not by tag**, since a couple of admin-only routers (`fraud/router.py`) don't carry an `"admin"` tag despite living under `/admin/`. `API_DOCUMENTATION.md` is the narrative companion: what `/partner-docs` can't convey on its own (the auth/refresh flow end to end, which rate limits apply where, the error-response shape, how the three stackable checkout discounts interact) plus an explicit, honest **"what's not available yet"** section — no channel-manager/PMS push-pull API, no webhooks, no machine-to-machine API-key auth, card payments still unconfigured — so an external developer hits a documented boundary instead of a silent gap.

**No new tables or migrations** — this is a docs + OpenAPI-schema-shaping change only, no runtime data model touched.

**Verified:** confirmed the app still imports cleanly and registers all 284 routes (up from 280 pre-change, the 4 new docs endpoints); called `_partner_openapi_schema()` directly and confirmed 169 partner-scoped paths with zero `/admin` or `front-desk` paths leaking through. Re-verified the same on the live production API post-deploy (`GET /api/v1/partner-docs/openapi.json`, `/partner-docs`, and `/docs` all `200`, the live filtered schema showing the same 169-path/zero-leak result as local testing). No frontend changes — no lint/build needed for this slice.

## Infrastructure note — Dokploy VPS backend (2026-09-03)

FastAPI Cloud's build infrastructure hit a sustained outage (repeated identical "Installing Python interpreter" failures on their build servers, confirmed via their own CLI's build logs — unrelated to this codebase), leaving production stuck for several hours without the bank-transfer commit. As a mitigation, the backend was also deployed to the user's own VPS via Dokploy:
- Project `ovigo` / application `ovigo-api` created via Dokploy's REST API (`x-api-key` auth), building from this repo's `backend/` directory using the existing `Dockerfile`.
- Domain `https://ovigo-api.salmandev.io` attached with Let's Encrypt SSL (DNS already pointed at the VPS).
- Same Neon database, R2, and SSLCommerz credentials as FastAPI Cloud; a freshly generated `JWT_SECRET_KEY` (FastAPI Cloud's was masked/unretrievable, and the local `.env`'s is explicitly dev-only) — meaning JWTs aren't interchangeable between the two backend instances.
- `.github/workflows/deploy-dokploy.yml` added (API key stored as a GitHub Actions secret) to auto-deploy here on every backend push, mirroring FastAPI Cloud's own auto-deploy.
- **The live frontend now points at this Dokploy backend** (`NEXT_PUBLIC_API_URL` updated on Vercel and redeployed, verified in the shipped JS bundle) — FastAPI Cloud is currently idle/unused, not decommissioned; worth revisiting once their outage clears.
- **(2026-09-03) A second container, `ovigo-elasticsearch`, was added to the same VPS** for Sprint 27-28's free-text search (see that section above) — a plain `docker run`, not a Dokploy-managed application, attached to `dokploy-network` and reachable by the backend at `http://ovigo-elasticsearch:9200`. Port 9200 is bound to the VPS's own loopback only (`127.0.0.1:9200`), for occasional SSH-tunneled admin access — never exposed publicly.

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
| 16 | Admin can manage disputes, refunds and payout holds | Done — either party to a booking can open a dispute; an admin resolves it as refunded (flips escrow to `REFUNDED`, cancels the held commission) or rejected (releases the hold). Opening a dispute now actually freezes the relevant `Commission` row (`ON_HOLD`) so it can't be swept into a payout batch while unresolved — the payout-hold mechanism landed in Sprint 16 Part 2 once a real payout system existed to hold against. |
| 17 | Partners can purchase featured placement | Done — "purchase" is flag-only (a partner sets a budget, spend accrues against it), not a real payment-gateway charge, consistent with how payouts/escrow already work in this codebase. See Sprint 17-18 |
| 18 | Sponsored results are visibly labelled | Done — a "Sponsored" badge and section heading on the tours/stays/rent-a-car search pages. See Sprint 17-18 |
| 19 | All important Admin actions are audit logged | Done — role approve/reject, document verify/reject, tour/property approve/reject, dispute resolve, business referral approve/reject. Extend as each new admin action lands |
| 20 | Tour, stay and partner profiles cannot be published without location tags | Done — enforced server-side at submit time for both tours and properties (verified: submitting without a tag returns 409); partner-role profiles don't have a separate "publish" gate yet since they're not publicly browsable pages on their own outside search results |
