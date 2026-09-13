# Prompt: Add eSIM sales to Ovigo via the Triptel Partner Reseller API

> Paste everything below this line into your coding agent, run from the root of the Ovigo repository.

---

## Your task

Add a complete **eSIM store** to Ovigo. Travelers browse eSIM data plans by destination country, pay in BDT through Ovigo's existing SSLCommerz gateway, and receive a working eSIM (QR code + activation code + one-tap install links) inside Ovigo. Ovigo sources every eSIM from **Triptel** (`https://triptel.co`) through Triptel's **Partner Reseller API**, paying for each eSIM from Ovigo's prepaid USD reseller wallet at Triptel.

This is a production marketplace with real users and real money. **No existing feature may break.** Work additively, verify as you go, and stop and ask the user whenever an instruction below conflicts with what you find in the code.

## 0. Read before writing any code

1. `TRIPTEL_PARTNER_API.md` (repo root) — the full Triptel API contract. It is the source of truth for every request/response shape, error code, idempotency rule and webhook detail used below. Read all of it.
2. `README.md`, `backend/README.md`, `IMPLEMENTATION_PLAN.md`, and the "Infrastructure note" section of `PROGRESS_TRACKER.md` — how this repo is built, tested and deployed.
3. `frontend/AGENTS.md`: **this is Next.js 16 with breaking changes from what you know.** Read the relevant guides in `frontend/node_modules/next/dist/docs/` before writing any frontend code, and heed deprecation notices.
4. Study these existing modules as the patterns to copy — **read them, don't modify them**:
   - `backend/app/modules/payments/` — SSLCommerz initiation, IPN + redirect double-confirmation, idempotent confirmation, `tran_id` format.
   - `backend/app/core/sslcommerz.py` — the gateway client you will reuse.
   - `backend/app/modules/bookings/` — service/router/schema conventions, `get_own_..._or_404` ownership pattern.
   - `backend/app/modules/notifications/service.py` — `notify()` (in-app only; there is no email/SMS provider).
   - `backend/app/core/exceptions.py` (`AppError`, `NotFoundError`, `ConflictError`), `backend/app/core/permissions.py` (`require_admin`, `require_super_admin`), `backend/app/core/audit.py`, `backend/app/core/cache.py`, `backend/app/core/rate_limit.py`, `backend/app/config.py`.
   - `backend/app/main.py` (router registration + `OPENAPI_TAGS`), `backend/app/all_models.py`.
   - Frontend: `src/lib/api-client.ts`, `src/lib/format.ts` (`formatMoney` → `৳`), `src/components/shared/ApproxPrice.tsx`, `src/app/bookings/[id]/page.tsx` (payment result + gateway redirect), `src/app/tours/page.tsx` (listing page), `src/app/admin/layout.tsx` + `src/app/admin/payments/page.tsx` (admin page conventions), `src/components/shared/Header.tsx` + `MobileMenu.tsx` (navigation), `src/app/(customer)/page.tsx` (home feature cards), `src/components/ui/*`.

## 1. Non-negotiable constraints

- **Do not change the behaviour of any existing module.** In particular, do not modify `bookings`, `payments`, `commissions`, `payouts`, `loyalty`, `promotions`, `disputes`, `reviews`, the cart store, or any existing DB table or column. eSIM orders are **not** bookings: they have no check-in/out, no partner, no commission, no escrow, no inventory. Keeping them in their own module is the whole point.
- The **only** permitted edits to existing files are small, additive touch points:
  - `backend/app/main.py` — import and `include_router` the new routers; add an `"esim"` entry to `OPENAPI_TAGS`.
  - `backend/app/all_models.py` — import the new models.
  - `backend/app/config.py` — new optional settings (§3.1).
  - `backend/app/modules/notifications/models.py` — two new `NotificationType` members (§3.2).
  - `backend/app/core/sslcommerz.py` — **optionally** add keyword arguments `product_name: str = "Ovigo Booking"` and `product_category: str = "Travel"` to `initiate_session` so eSIM payments aren't labelled "Ovigo Booking". The defaults must keep every existing call byte-for-byte identical.
  - `backend/.env.example` — document new variables.
  - Frontend navigation/home/admin nav entries (§5.4), `frontend/package.json` (one QR code dependency).
  - Docs: `PROGRESS_TRACKER.md`, `API_DOCUMENTATION.md` endpoint map, `backend/README.md` if needed.
  If you believe anything else must change, stop and ask the user first.
- **Database safety.** The Dockerfile does **not** run migrations. `alembic upgrade head` is run manually, and local development may point at the same Neon database as production. **Never run `alembic upgrade`, any script that writes data, or any test that touches the database without first confirming with the user which database `DATABASE_URL` points to.** Generate the migration, review it by hand, and hand the user the exact command to run.
- **Migrations must be purely additive** (new tables, new enum types, new enum *values*). No drops, renames or changes to existing columns.
- **Secrets:** the Triptel API key and webhook secret live only in environment variables on the backend. Never send them to the frontend, never log them, never commit them. Never expose Ovigo's USD cost, exchange rate or margin to travelers — only to admins.
- The app must **boot and all existing pages must work even when Triptel is not configured** (no env vars set): eSIM endpoints then return `503` with `"eSIM service is not available"`, and the eSIM pages show a friendly "coming soon / unavailable" state.
- `npm run lint` and `npm run build` must pass. `python -m pytest -q` must pass (see §6 for which tests are safe to run).

## 2. How the Triptel side works (summary — details in `TRIPTEL_PARTNER_API.md`)

- Base URL `https://triptel.co/api/v1/partner`. Exchange the API key (`POST /auth/token`) for a 1-hour bearer token; renew on expiry or `401`.
- Catalog: `GET /countries`, `GET /countries/{iso2}/products` — `retail_price` in **USD** is what Ovigo's Triptel wallet is charged.
- `GET /me` — `wallet_balance` (USD) Ovigo can spend, `commission_balance`, `commission_rate_pct`.
- `POST /orders {product_id, customer_reference}` — debits the wallet, returns the order in `PROCESSING`. **Idempotent on `customer_reference`**: retrying with the same reference and product returns the original order (`idempotent_replay: true`) and never charges twice. Use **the Ovigo eSIM order's own UUID** as `customer_reference`, always.
- Order settles within ~10–30 s to `COMPLETED` (eSIM fields + `install_links` filled) or `FAILED` (Triptel refunds Ovigo's wallet automatically). `GET /orders/{order_id}` polls; `GET /orders?customer_reference=...` finds an order by Ovigo's reference.
- Webhook: Triptel POSTs the order object to Ovigo when it settles, signed with `X-Webhook-Signature` = hex HMAC-SHA256 of the raw body using the webhook secret. Retries up to 3 times; can arrive more than once.

## 3. Backend — new module `backend/app/modules/esim/`

Follow the existing module layout: `models.py`, `schemas.py`, `service.py`, `router.py`, plus `triptel_client.py` and `pricing.py`. Async SQLAlchemy 2.0 with `Mapped[...]`, UUID primary keys, `created_at`/`updated_at` with `server_default=func.now()`, exactly like `bookings/models.py`.

### 3.1 Settings (`app/config.py`)

Add, all optional so the app boots without them:

```python
triptel_api_base_url: str = "https://triptel.co/api/v1/partner"
triptel_api_key: str | None = None
triptel_webhook_secret: str | None = None

@property
def triptel_configured(self) -> bool:
    return bool(self.triptel_api_key)
```

Document them in `backend/.env.example` with placeholder values.

### 3.2 Models

**`EsimOrderStatus`** (`str, enum.Enum`, DB enum name `esim_order_status`):

| Status | Meaning |
|---|---|
| `pending_payment` | Created, traveler hasn't paid yet |
| `paid` | SSLCommerz payment validated; Triptel order not yet accepted (e.g. Triptel unreachable) |
| `provisioning` | Triptel accepted the order (`PROCESSING`) |
| `completed` | eSIM delivered |
| `refund_pending` | Paid, but the eSIM could not be delivered; the traveler is owed a refund |
| `refunded` | An admin confirmed the refund was made to the traveler |
| `cancelled` | Abandoned or failed payment, never paid |

Allowed transitions (enforce in one place, in `service.py`; reject anything else with `ConflictError`):
`pending_payment → paid | cancelled`, `paid → provisioning | completed | refund_pending`, `provisioning → completed | refund_pending`, `refund_pending → refunded`. `completed`, `refunded` and `cancelled` are terminal. Repeating a transition to the state an order is already in is a silent no-op; it is not an error, because webhooks and polling race.

**`EsimOrder`** (table `esim_orders`):
- `id` UUID PK; `user_id` FK `users.id` (`ondelete="CASCADE"`, indexed); `status`.
- Product snapshot, frozen at order time: `triptel_product_id` (str), `product_title`, `country_iso2`, `country_name`, `data_amount_gb` (Numeric), `is_unlimited` (bool), `validity_days` (int).
- Money snapshot: `cost_usd` Numeric(10,4), `exchange_rate` Numeric(12,4) (BDT per USD), `markup_pct` Numeric(5,2), `price_bdt` Numeric(10,2), `currency` String(3) default `"BDT"`.
- Payment: `tran_id` String(100) unique + indexed, `val_id` nullable, `gateway_response` JSONB nullable, `paid_at` nullable.
- Triptel: `triptel_order_id` nullable + indexed, `triptel_order_no` nullable, `triptel_status` nullable, `last_synced_at` nullable.
- eSIM: `iccid`, `lpa_string` (Text), `qr_code_data` (Text), `smdp_address`, `matching_id`, `install_links` (JSONB), all nullable; `completed_at` nullable.
- Failure/refund: `failure_reason` Text nullable, `refunded_at` nullable, `refunded_by_id` FK `users.id` nullable, `refund_note` Text nullable.
- `created_at`, `updated_at`.

**`EsimPricingConfig`** (table `esim_pricing_config`, a single row, created with defaults on first read): `usd_to_bdt_rate` Numeric(12,4) default `125.0000`, `markup_pct` Numeric(5,2) default `15.00`, `rounding_step_bdt` Integer default `10`, `is_enabled` Boolean default `True`, `updated_by_id` nullable FK, `updated_at`. Admins edit it (§3.7). `is_enabled = False` hides the store (the endpoints return `503`) without a redeploy.

**Notifications:** add `ESIM_READY = "esim_ready"` and `ESIM_FAILED = "esim_failed"` to `NotificationType`. Alembic autogenerate does **not** detect new values on an existing PostgreSQL enum, so write them into the migration by hand:

```python
with op.get_context().autocommit_block():
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'esim_ready'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'esim_failed'")
```

The downgrade cannot remove enum values. Leave a comment saying so, and drop only the new tables and types.

Generate one migration (`alembic revision --autogenerate -m "esim store via triptel partner api"`), add the enum `ALTER`s, and read every line to confirm it only adds things. Register the models in `app/all_models.py`.

### 3.3 `triptel_client.py`

A small async client around `httpx.AsyncClient`, not the shared app client.
- Timeouts: 10 s connect, 30 s total.
- **Token cache:** a module-level token and expiry guarded by an `asyncio.Lock`. Renew when fewer than 5 minutes remain. On a `401` from any call, force-renew once and retry that call once.
- **Retries:** `GET` requests retry up to 3 times on network errors or `5xx`, with backoff (0.5 s, 1 s, 2 s). `POST /orders` may be retried the same way **only because** it always carries `customer_reference` (see `TRIPTEL_PARTNER_API.md` §2.4). Never retry `4xx` other than the single `401` refresh.
- **Errors:** raise `TriptelError(AppError)` with `status_code=502` for upstream and network failures. Keep Triptel's `status_code` and `detail` on the exception for logging, but never include the API key.
- Methods: `list_countries()`, `list_products(iso2)`, `get_account()`, `create_order(product_id, customer_reference)`, `get_order(order_id)`, `find_order_by_reference(customer_reference)`, `set_webhook(url)`.
- Refuse to run when `settings.triptel_configured` is false (raise the `503` error).

### 3.4 `pricing.py` (pure functions, unit-tested)

```
price_bdt = ceil_to_step(cost_usd × usd_to_bdt_rate × (1 + markup_pct / 100), rounding_step_bdt)
```

- Use `Decimal` throughout, never `float`.
- `ceil_to_step` always rounds **up** to the next multiple of the step (a step of `0` or `1` means round up to whole taka), so Ovigo never sells below cost.
- `data_label(is_unlimited, data_amount_gb)` returns `"Unlimited"` when `is_unlimited` is true or the amount is 0, otherwise `"{amount} GB"` without trailing zeros.

### 3.5 Service flow (`service.py`)

**Catalog (public, no login):**
- `list_countries()` — the Triptel country list. Cache it for 1 hour with `core/cache.py`'s `cached` decorator; its key is static, which is fine here.
- `list_products(iso2)` — the Triptel products for that country, cached for 15 minutes per ISO2. `cached` only supports a static key, so keep a small TTL dict inside the esim module rather than changing `core/cache.py`. Return each product with `id`, `title`, `data_label`, `is_unlimited`, `data_amount_gb`, `validity_days` and `price_bdt`, computed from the current `EsimPricingConfig`. **Never include `retail_price`/`cost_usd` in public responses.**

**Create order** — `POST /api/v1/esim/orders` `{ "product_id": "...", "country_iso2": "SG" }` (logged in):
1. Store enabled and Triptel configured, else `503`.
2. Re-fetch that country's products **live**, bypassing the cache, and find `product_id`. Missing or inactive → `404` "This plan is no longer available".
3. Compute `price_bdt` from the live `retail_price` and the current pricing config.
4. `GET /me` from Triptel. If `wallet_balance < retail_price`, return `503` "eSIM purchases are temporarily unavailable", log a warning, and notify admins if a pattern for that exists. **A traveler must never be able to pay for an eSIM Ovigo can't afford to buy.**
5. Insert the `EsimOrder` as `pending_payment` with the full product and money snapshot, and return it.

**Pay** — `POST /api/v1/esim/orders/{id}/pay` (owner only, status `pending_payment`):
- `tran_id = f"OVIGOESIM{order.id.hex[:12].upper()}{uuid4().hex[:6].upper()}"`.
- Save the `tran_id` and commit **before** calling SSLCommerz, exactly as `payments/service.py` does.
- Call `sslcommerz.initiate_session` with `amount=str(order.price_bdt)`.
- Callback URLs:
  - `success_url`: `{backend_url}/api/v1/esim/payments/callback/success?tran_id=...`
  - `fail_url`: `{backend_url}/api/v1/esim/payments/callback/fail?tran_id=...`
  - `cancel_url`: `{backend_url}/api/v1/esim/payments/callback/cancel?tran_id=...`
  - `ipn_url`: `{backend_url}/api/v1/esim/payments/ipn`
- Pass `product_name="Ovigo eSIM"` and `product_category="Telecom"` if you added those kwargs.
- Return `{ "gateway_page_url": ... }`.

**Payment confirmation** — mirror `payments/service.py` exactly: the IPN and the browser redirect are two independent paths that both end in one idempotent `_confirm_esim_payment`:
- Lock the order row (`SELECT ... FOR UPDATE` by `tran_id`). If it is already past `pending_payment`, do nothing.
- Validate the transaction with `sslcommerz.validate_transaction(val_id)`. Require status `VALID`/`VALIDATED` and require that `Decimal(reported amount)` equals `order.price_bdt` exactly. Otherwise don't mark it paid, and record why.
- Set `paid`, `paid_at`, `val_id` and `gateway_response`, then **commit** before calling Triptel.
- Then call `place_triptel_order(order)` (below). A Triptel failure here must **not** undo the payment; the order stays `paid` for retry.
- A failed or cancelled payment sets `cancelled` if the order is still `pending_payment`, and never cancels a paid order.
- Redirect the browser to `{frontend_url}/esim/orders/{id}?payment=success|failed|cancelled`.

**`place_triptel_order(order)`** (safe to call any number of times):
- Only acts on status `paid`.
- Call `create_order(order.triptel_product_id, customer_reference=str(order.id))`.
- On success, store `triptel_order_id`, `triptel_order_no` and `triptel_status`, set `provisioning`, then immediately apply the returned order object, because an idempotent replay may already be `COMPLETED`.
- On `TriptelError`: stay `paid` and store `failure_reason`.
- On Triptel `400` insufficient balance or `404` product gone: move to `refund_pending` with a clear `failure_reason`, and notify the traveler.

**`apply_triptel_order(db, order, payload)`** is the single function every source uses: the webhook, polling, the `POST /orders` response and admin sync.
- Check `payload["customer_reference"] == str(order.id)`, and that `triptel_order_id` matches if it is already set.
- `COMPLETED`: store `iccid`, `lpa_string`, `qr_code_data`, `smdp_address`, `matching_id`, `install_links`, `triptel_status` and `completed_at`; set `completed`; then `notify(... ESIM_READY, link=f"/esim/orders/{id}")`.
- `FAILED`: set `refund_pending` with `failure_reason = "The eSIM provider could not issue this eSIM"`; then `notify(... ESIM_FAILED ...)` telling the traveler their payment will be refunded. Triptel has already refunded Ovigo's wallet.
- `PROCESSING`: update `triptel_status` and `last_synced_at` only.
- Apply idempotently. A second identical delivery must not create a second notification.

**`sync_order(order)`**
- If `triptel_order_id` is set, call `get_order`. Otherwise call `find_order_by_reference(str(order.id))`, which covers "Triptel accepted it but we never got the response".
- If Triptel has an order, apply it. If Triptel has none and the status is `paid`, call `place_triptel_order`.

**Keeping orders moving without a scheduler** — Ovigo has no Celery, Redis or cron. **Do not add one.** Instead:
- When `GET /api/v1/esim/orders/{id}` loads an order in `paid` or `provisioning` that hasn't been synced in the last 20 seconds, call `sync_order` before responding. The order page polls, so a traveler waiting on the page drives their own order to completion.
- Admins get "Sync" and "Retry provisioning" buttons (§3.7).
- The webhook is the primary delivery path.

### 3.6 Routers

`router.py`, prefix `/api/v1/esim`, `tags=["esim"]`:

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /countries` | public | Destination list |
| `GET /countries/{iso2}/products` | public | Plans with BDT prices |
| `POST /orders` | traveler | Create order (rate-limit `10/minute` with the existing `limiter`) |
| `GET /orders` | traveler | Own orders, newest first |
| `GET /orders/{id}` | traveler (owner) | Own order; `404` for anyone else's (same pattern as `get_own_booking_or_404`) |
| `POST /orders/{id}/pay` | traveler (owner) | Start SSLCommerz checkout |
| `POST /orders/{id}/cancel` | traveler (owner) | Only from `pending_payment` |
| `POST /payments/ipn` | none (validated via SSLCommerz) | IPN |
| `GET|POST /payments/callback/success|fail|cancel` | none | Browser redirects (copy `_callback_params` behaviour) |
| `POST /webhooks/triptel` | HMAC signature | Triptel webhook |

**Webhook handler:**
- Read `raw = await request.body()` **before** any JSON parsing.
- Verify with `hmac.compare_digest(hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest(), request.headers.get("X-Webhook-Signature", ""))`. If the secret isn't configured or the signature doesn't match, return `401`.
- If `X-Webhook-Event` is `webhook.test` (or the body's `event` is `"webhook.test"`), it's a signed test ping sent from Triptel's Partner Dashboard, not an order: after verifying the signature, return `200 {"received": true}` without touching any order. Real order deliveries carry `X-Webhook-Event: order.updated`.
- Then parse the body, find the order by `customer_reference` and call `apply_triptel_order`. Return `200 {"received": true}`.
- An unknown `customer_reference` returns `200` (log it) so Triptel doesn't retry forever.
- Keep it fast: no outbound calls inside the handler.

Admin router, prefix `/api/v1/admin/esim` (the `/api/v1/admin` prefix automatically excludes it from `/partner-docs`), `dependencies=[Depends(require_admin)]`:

| Method & path | Purpose |
|---|---|
| `GET /orders?status=&q=` | All eSIM orders (search by id, `tran_id`, `iccid` or traveler email) including cost, price and margin |
| `GET /orders/{id}` | Detail |
| `POST /orders/{id}/sync` | `sync_order` |
| `POST /orders/{id}/retry-provisioning` | `place_triptel_order` for `paid` orders (safe: same `customer_reference`) |
| `POST /orders/{id}/mark-refunded` `{note}` | `refund_pending → refunded` after the admin refunded the traveler outside the system (SSLCommerz merchant panel or bank). Record `refunded_by_id`, `refund_note`, `refunded_at`, and `core/audit.record` it |
| `GET /pricing` / `PUT /pricing` | Read / update `EsimPricingConfig` (`PUT` requires `require_super_admin`; validate rate > 0, 0 ≤ markup ≤ 200, step ≥ 0; audit-log it) |
| `GET /account` | Triptel `GET /me` (wallet balance, commission balance, commission rate, webhook configured) |

Every admin mutation calls `core/audit.record` with `entity_type="esim_order"` or `"esim_pricing_config"`.

### 3.7 One-time webhook setup script

`backend/scripts/configure_triptel_webhook.py`:
- Import `app.all_models` first, like the other scripts.
- Call `PUT /webhook-config` with `https://ovigo-api.salmandev.io/api/v1/esim/webhooks/triptel`, or a URL passed as an argument.
- Print the returned `webhook_secret` once, with instructions to set it as `TRIPTEL_WEBHOOK_SECRET` on the Dokploy `ovigo-api` application and redeploy.
- Document that running it again **rotates** the secret.

## 4. Behaviour details that matter

- **Price changes:** the traveler pays `order.price_bdt`, fixed at order creation. If Triptel's live `retail_price` rises before payment completes, Triptel charges the new price and Ovigo absorbs the difference. Note this in the admin order detail (cost at order time vs. amount Triptel actually charged, from the Triptel order's `amount`).
- **Stale `pending_payment` orders:** when a traveler opens an order that has been `pending_payment` for more than 2 hours, show a "Start again" button that creates a fresh order from current prices rather than paying the stale one. Refuse `/pay` on those orders with `409`.
- **Unlimited plans** always display "Unlimited", never "0 GB".
- **All prices shown to travelers are BDT** via `formatMoney`, with `<ApproxPrice amountBDT=... />` next to them like everywhere else.
- **Ownership:** a traveler can only ever see their own eSIM orders; activation data is sensitive.
- **Logging:** log order id, `tran_id`, Triptel order id and status transitions. Never log the API key, the webhook secret, or full activation codes.

## 5. Frontend (Next.js 16 — read the local Next docs first)

Use TanStack Query and `apiClient` like the existing pages. Match the existing visual language: Tailwind v4, the `components/ui` primitives, and zinc/primary colours with dark mode classes.

### 5.1 Types — `src/types/esim.ts`
`EsimCountry`, `EsimProduct`, `EsimOrderStatus`, `EsimOrder`, and `ESIM_ORDER_STATUS_LABELS`, mirroring the backend schemas. Admin-only fields go in a separate `AdminEsimOrder` type.

### 5.2 Traveler pages
- **`/esim`** — hero ("Stay connected abroad — instant eSIM data in 190+ countries"), a country search box (client-side filter), and a grid of country cards (flag, name) with popular countries first. Loading skeletons, `EmptyState`/`ErrorState`, and an "unavailable" state for `503`.
- **`/esim/[iso2]`** — country header and product cards:
  - Each card shows the data label, validity days, `formatMoney(price_bdt)` plus `ApproxPrice`, and a **Buy** button.
  - **Not logged in:** Buy sends the traveler to `/account/login`. Check how login handles post-login redirects and follow that; if there is none, return to this page after login.
  - **Logged in:** Buy calls `POST /orders`, then `POST /orders/{id}/pay`, then `window.location.href = gateway_page_url`.
  - Include a short "Before you buy" note: the phone must be eSIM-compatible and carrier-unlocked, and installation needs Wi-Fi.
- **`/esim/orders`** — the traveler's eSIM orders: status badge, plan, country, price, date.
- **`/esim/orders/[id]`** — the heart of the feature:
  - The `?payment=success|failed|cancelled` banner, same pattern as the booking page.
  - While `paid`/`provisioning`: a spinner with "Setting up your eSIM — this usually takes under a minute", and `refetchInterval: 4000`; stop polling in any terminal state.
  - `pending_payment`: a **Pay now** button, or **Start again** if stale (§4).
  - **`completed`:**
    - A QR code rendered from `qr_code_data` (add `qrcode.react`), with a "Scan with the phone that will use the eSIM" caption.
    - **Install on iPhone** and **Install on Android** buttons linking to `install_links.ios` / `.android`, with a note that they only work on the phone itself (iOS 17.4+, recent Android), otherwise scan the QR.
    - Copy buttons for the full activation code (`lpa_string`), SM-DP+ address and activation code (`matching_id`) for manual entry.
    - ICCID, plan, validity and order number.
    - iOS and Android step-by-step install instructions in tabs, plus tips: install before travelling, turn on data roaming for this eSIM line on arrival, don't delete the eSIM.
    - A **Print / Save as PDF** button (`window.print()` with print-friendly styles).
  - `refund_pending`: "We couldn't issue this eSIM. Your payment of ৳X will be refunded — our team has been notified." `refunded`: the refunded date. `cancelled`: "Payment not completed".

### 5.3 Admin page — `/admin/esim`
- **Triptel account card** from `GET /admin/esim/account`: wallet balance (USD) with a low-balance warning below $20, commission balance, webhook configured yes/no.
- **Pricing card:** exchange rate, markup %, rounding step and enabled toggle, with a live example ("a $4.50 plan sells for ৳…"). Editable by super admins only; read-only for other admins.
- **Orders table:** status tabs (all, `paid`, `provisioning`, `refund_pending`, `completed`, `refunded`, `cancelled`) and search. Each row shows traveler, plan, `price_bdt`, `cost_usd`, margin, Triptel order no, status and created date, plus actions: **Sync**, **Retry provisioning** (`paid` only), **Mark refunded** (`refund_pending` only, requires a note). Highlight `refund_pending` rows.

### 5.4 Navigation (additive only)
- `Header.tsx` `PRIMARY_NAV`: add `{ href: "/esim", label: "eSIM", icon: Smartphone }`. `TRAVELER_LINKS`: add `{ href: "/esim/orders", label: "My eSIMs" }`. Mirror both in `MobileMenu.tsx`.
- Home page `FEATURES`: add an eSIM card linking to `/esim`. Keep the grid balanced.
- `admin/layout.tsx` `NAV`: add `{ href: "/admin/esim", label: "eSIM Orders" }`.

## 6. Tests

`backend/tests/` currently contains only a health check, and the app talks to a real Neon database. **Do not write or run tests that need the database unless the user confirms a disposable test database.** Write fast, isolated tests instead:

- `test_esim_pricing.py`:
  - Rounding always goes up to the step, and a step of 0/1 still rounds up.
  - `Decimal` precision holds.
  - The unlimited label.
- `test_esim_webhook_signature.py`:
  - Signature verification accepts the correct HMAC over the raw bytes.
  - It rejects a tampered body, a wrong secret or a missing header.
  - A re-serialised JSON body does not verify.
  - Call the verification helper directly; if you use the ASGI client, keep the route from reaching the DB for a bad signature.
- `test_triptel_client.py`:
  - Use `httpx.MockTransport`.
  - The token is fetched once and reused, and renewed near expiry.
  - A `401` triggers exactly one renewal and retry.
  - `5xx` `GET`s are retried; `4xx` are not.
  - `create_order` always sends `customer_reference`.
  - The API key never appears in raised error messages.
- `test_esim_transitions.py`:
  - The pure transition-validation function allows exactly the transitions in §3.2.
  - Repeated transitions are no-ops.
  - Everything else raises.
  - Structure `apply_triptel_order`'s decision logic, which payload leads to which status and which fields, as a pure function so it is testable without a DB.

Run the existing suite too (`python -m pytest -q`) and make sure `test_health.py` still passes. Run `npm run lint` and `npm run build` in `frontend/`.

## 7. Documentation

- `PROGRESS_TRACKER.md`: add an "eSIM store (Triptel Partner API)" section in the existing style. Cover what was built, the architecture decision (separate module, not a booking item type, and why), the status machine, the refund process (manual, via admin "Mark refunded"), and the deploy steps below.
- `API_DOCUMENTATION.md`: add an `esim` row to the endpoint map (traveler-facing endpoints only).
- `backend/.env.example`: the three `TRIPTEL_*` variables.

## 8. Deployment checklist (hand this to the user; do not perform production steps yourself)

1. Triptel issues Ovigo's API key; the user tops up the Triptel reseller wallet.
2. Set `TRIPTEL_API_KEY` (and optionally `TRIPTEL_API_BASE_URL`) on the Dokploy `ovigo-api` application.
3. Run the migration against production: `alembic upgrade head`, run by the user with the production `DATABASE_URL`/`SYNC_DATABASE_URL`, after a Neon branch/backup.
4. Push to `main`: Dokploy deploys the backend and Vercel deploys the frontend.
5. Run `python scripts/configure_triptel_webhook.py`, set the printed secret as `TRIPTEL_WEBHOOK_SECRET` on Dokploy, and redeploy.
6. In `/admin/esim`: confirm the Triptel account card shows the wallet balance and "webhook configured", then set the exchange rate and markup.
7. Confirm whether SSLCommerz is live or sandbox (`SSLCOMMERZ_IS_LIVE`), then buy the cheapest plan end to end. Verify:
   - Payment is validated and the order moves `paid → provisioning → completed` within a minute.
   - The QR code scans and the install link opens on a phone.
   - The in-app notification arrives.
   - The admin table shows cost, price and margin.
   - Triptel's wallet was debited once.
8. Check that existing flows still work on production: browse tours/stays/vehicles, create a booking and reach the SSLCommerz page, admin payments page.

## 9. Definition of done

- A logged-in traveler can find a country, buy a plan in BDT through SSLCommerz, and see a working eSIM (QR, activation code, install links, instructions) on `/esim/orders/{id}` without refreshing.
- A paid order always ends in `completed` or `refund_pending`, even if the webhook never arrives (page polling plus admin sync), and is never charged twice at Triptel (`customer_reference` = order id on every attempt).
- The traveler can never pay when Ovigo's Triptel wallet can't cover the eSIM.
- Admins can see margins, fix stuck orders, record refunds, and manage pricing; every mutation is audit-logged.
- With `TRIPTEL_API_KEY` unset the whole app still boots and every existing page works; the eSIM pages show an unavailable state.
- No existing module's behaviour changed; the migration is additive only; lint, build and tests pass.
- Summarise at the end: files added, files touched (with the reason for each touch), the migration file name, the exact commands the user must run, and anything you could not verify.
