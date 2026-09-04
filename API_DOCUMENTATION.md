# Ovigo API — Developer Guide for External Partners

This is the reference for a third party integrating against Ovigo's public HTTP API —
an OTA, a channel manager, a travel agency booking on a traveler's behalf, or anyone
else consuming Ovigo programmatically rather than through the traveler-facing web app.

It is a curated companion to the full interactive docs, not a replacement for them:

| Docs surface | URL | Scope |
|---|---|---|
| **Partner docs (Swagger UI)** | `/partner-docs` | Every endpoint an external partner would plausibly use — public browsing, auth, bookings, payments, reviews, chat, etc. Internal admin and property-front-desk endpoints are excluded. **Start here.** |
| Full docs (Swagger UI) | `/docs` | Everything, including internal admin/staff endpoints — useful context, but most of it isn't meant for an outside integration. |
| Raw OpenAPI schema | `/api/v1/partner-docs/openapi.json` | The same partner-scoped schema as `/partner-docs`, as machine-readable JSON — feed this into your own client generator (openapi-generator, `openapi-typescript`, Postman's "import schema", etc.) instead of hand-writing a client. |

**Base URL (production):** `https://ovigo-api.salmandev.io`

> Every path below is relative to that base URL. There is currently one API version,
> `/api/v1`, embedded directly in the path (see **Versioning** below).

---

## 1. Authentication

Every endpoint other than public browsing (locations, published tours/stays/vehicles,
search, destinations) requires a JWT **bearer token**.

### Get a token

```
POST /api/v1/auth/register     # new account — email or phone + password (>= 8 chars)
POST /api/v1/auth/login        # { "identifier": "<email or phone>", "password": "..." }
```

Both return the same shape:

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<jwt>",
  "token_type": "bearer",
  "user": { "id": "...", "full_name": "...", "email": "...", "system_role": "traveler", ... }
}
```

### Use the token

Send the **access token** on every authenticated request:

```
Authorization: Bearer <access_token>
```

### Refresh it

Access tokens expire (short-lived by design). When one does, exchange the refresh
token for a new access token — no re-login needed:

```
POST /api/v1/auth/refresh
{ "refresh_token": "<refresh_token>" }
```

```json
{ "access_token": "<new jwt>", "token_type": "bearer" }
```

There's no token-revocation/logout blocklist beyond `POST /api/v1/auth/logout` clearing
the *current* session's cookies in the browser client — for a server-to-server
integration, simply stop using a refresh token to retire it and let the access token
it issued expire naturally.

### Roles

A token's `user.system_role` is `traveler`, `admin`, or `super_admin`. Partner-specific
capabilities (Local Expert, Host, Rent-a-Car, ...) are a separate layer — a **partner
role** attached to the same user account, applied for via `POST /api/v1/partners/roles`
and approved by an Ovigo admin. Most of this guide assumes you're integrating as a
**traveler-facing consumer** (browsing and booking on behalf of your own users); if
you're building a partner-side integration (listing your own inventory), start with the
`partners`, `tours`, `stays`, and `rent-a-car` sections below instead.

---

## 2. Conventions

- **Versioning:** the entire API lives under `/api/v1/...`. There is no `v2` yet; a
  breaking change to a stable endpoint would introduce one rather than break `v1` in
  place.
- **Content type:** JSON in, JSON out, everywhere except file uploads (`multipart/form-data`
  for image/attachment endpoints) and the two calendar-sync endpoints, which serve/accept
  `text/calendar` (`.ics`).
- **Errors:** a non-2xx response is always `{"detail": "<human-readable message>"}` with
  a real HTTP status code (`400` bad input, `401` missing/invalid token, `403` wrong
  role/ownership, `404` not found, `409` conflict — e.g. no inventory left, a promo code
  already used, `429` rate-limited). There is no separate machine-readable error code
  field yet — match on the status code, not the message text, if you need to branch on
  the failure.
- **Pagination:** most list endpoints return a plain JSON array with no pagination —
  data volumes are small at this stage. The one exception is chat message history
  (`GET /api/v1/chat/threads/{id}/messages`), which is cursor-paginated via a `before`
  timestamp + `limit` query param (default 50, max 100).
- **Rate limiting:** applied narrowly, keyed by client IP, to the endpoints most prone to
  abuse — not globally, so normal integration traffic is never affected:
  - `POST /api/v1/auth/register`, `/login`: 10/minute
  - `POST /api/v1/auth/verify-email/request`, `/verify-phone/request`: 5/minute
  - `POST /api/v1/auth/verify-email/confirm`, `/verify-phone/confirm`: 10/minute

  A `429` response includes a `Retry-After`-style message in `detail`; back off and retry.
- **Currency:** every price is a plain decimal string in Bangladeshi Taka (BDT) — there's
  no currency field to branch on for charging purposes (`GET /api/v1/fx/rates` exists
  purely for *displaying* an approximate foreign-currency hint; the amount actually
  charged is always BDT via SSLCommerz).

---

## 3. Endpoint map

Everything below is also fully documented (request/response schemas, every field) at
`/partner-docs` — this table is a map to find your way there faster, not a substitute
for it.

| Domain | Prefix | What it's for |
|---|---|---|
| Auth | `/api/v1/auth` | Register, log in, refresh, OTP verification |
| Users | `/api/v1/users` | The current user's own profile |
| Locations | `/api/v1/locations` | Browse the Country → Region → City → Attraction tree |
| Tours | `/api/v1/tours` | Browse published fixed-date tours; `GET /api/v1/tours/{id}/similar` and `/frequently-booked-with` for recommendations |
| Stays | `/api/v1/properties` | Browse published properties, room types, availability |
| Rent-a-Car | `/api/v1/vehicles` | Browse published vehicles |
| Search | `/api/v1/search` | `GET /stays` (date + guest filtered), `GET /vehicles` (date filtered), `GET /experts`, `GET /destinations` |
| Free-text search | `?q=<keyword>` on `/tours`, `/properties`, `/vehicles`, `/search/stays` | Keyword search layered on top of the above (Elasticsearch-backed, degrades to a substring match if unavailable) |
| Bookings | `/api/v1/bookings` | Create a booking (tour/stay/vehicle, or a mix — see **Dynamic packaging** below), check in/out, cancel |
| Payments | `/api/v1/payments` | Initiate an SSLCommerz checkout or a bank-transfer payment for a booking |
| Loyalty | `/api/v1/loyalty` | A traveler's own points balance/history; redeem via `redeem_points` on booking creation |
| Promotions | `/api/v1/promotions/validate/{code}` | Check a promo code before applying it via `promo_code` on booking creation |
| Reviews | `/api/v1/reviews` | Leave a review on a completed booking item |
| Chat | `/api/v1/chat` | Message threads tied to a tour/property/vehicle/booking; REST for history + sending, a read-only WebSocket for live push |
| Custom tour bidding | `/api/v1/custom-requests`, `/api/v1/bids` | A traveler posts a custom trip request; Local Experts bid on it |
| Partners | `/api/v1/partners` | Apply for a partner role, manage documents |
| Business network | `/api/v1/business-network` | Partner-to-partner referrals |
| FX rates | `/api/v1/fx/rates` | Live BDT → foreign-currency display rates (informational only) |

### A booking's shape, in brief

```json
POST /api/v1/bookings
{
  "items": [
    { "item_type": "tour_departure", "tour_departure_id": "...", "quantity": 2 },
    { "item_type": "room_type", "room_type_id": "...", "check_in_date": "2026-12-01", "check_out_date": "2026-12-03" }
  ],
  "guests": [{ "full_name": "Jane Doe" }],
  "promo_code": "WELCOME10",
  "redeem_points": 50
}
```

Mixing 2+ distinct item types (`tour_departure`/`room_type`/`vehicle_rental`) in one
booking earns an automatic **dynamic-packaging discount** (5% for 2 types, 10% for 3) —
no extra flag needed. `promo_code` and `redeem_points` are both optional; each is
validated server-side and rejected with a `409` if invalid/expired/insufficient. The
response's `Booking` object breaks out every discount separately
(`bundle_discount_amount`, `promo_discount_amount`, `loyalty_discount_amount`) so you
can show a traveler exactly what was applied — `total_amount` is always the final,
post-discount amount actually owed.

---

## 4. What's not available yet

Being upfront about the current boundary rather than leaving it to be discovered by
trial and error:

- **No dedicated channel-manager / PMS push-pull API.** A Host/Hotel partner manages
  their own availability directly (or via the iCal import/export described below) —
  there's no separate authenticated endpoint surface for an external PMS to push rate/
  availability updates into Ovigo yet. Tracked as future work.
- **iCal sync exists, but it's one-directional.** `GET /api/v1/ical/room-types/{id}` (a
  per-room-type `.ics` export, gated by an unguessable token rather than a bearer token
  — the same pattern Airbnb/Booking.com/Google Calendar use for their own "secret
  calendar link" exports) and the property dashboard's iCal-import-by-URL let a host
  sync *against* an external calendar (Airbnb, Booking.com) to prevent double-booking.
  There's no push in the other direction — Ovigo bookings aren't written back into an
  external platform's own calendar.
- **Card payments (Stripe) aren't configured.** Only SSLCommerz (Bangladesh-focused
  gateway) and manual bank transfer are live payment methods today.
- **No API keys / OAuth client-credentials flow for machine-to-machine auth.** Every
  request authenticates as a real user account (see §1) — there's no separate
  "integration app" credential type yet. If you're building a server-side integration,
  register/maintain a dedicated Ovigo account for it rather than trying to act as a
  specific traveler.
- **No webhooks.** There's no way to be notified of a booking/payment status change
  other than polling the relevant `GET` endpoint. The in-app WebSocket at
  `/api/v1/chat/ws/{thread_id}` is chat-specific push, not a general event stream.

---

## 5. Support

This API is under active development — if something in `/partner-docs` doesn't match
this guide, trust `/partner-docs` (or the underlying JSON schema) and treat the gap as
this document needing an update, not the API being wrong. There's no public developer
support channel yet; route questions through your existing Ovigo point of contact.
