"""FastAPI application entrypoint."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

import app.all_models  # noqa: F401 — see its docstring: must load before any router.
# Several service modules build a module-level `selectinload(...)` tuple at import
# time (e.g. bookings/service.py's _EAGER), which forces SQLAlchemy to configure
# every relationship it can reach — including ones that reference another module's
# model by string name (BookingItem.reviews -> "Review"). If that other module
# hasn't been imported yet, mapper configuration fails with a confusing
# "failed to locate a name" error that depends on router import order. Importing
# all_models first, before any router, makes every model registered up front so
# router import order stops mattering.
from app.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.rate_limit import limiter
from app.modules.admin.router import router as admin_router
from app.modules.ads.router import admin_router as ads_admin_router
from app.modules.ads.router import router as ads_router
from app.modules.analytics.router import router as analytics_router
from app.modules.auth.router import router as auth_router
from app.modules.badges.router import admin_router as badges_admin_router
from app.modules.badges.router import router as badges_router
from app.modules.bidding.router import bids_router as bidding_bids_router
from app.modules.bidding.router import router as bidding_router
from app.modules.bookings.router import front_desk_router
from app.modules.bookings.router import router as bookings_router
from app.modules.business_network.router import admin_router as business_network_admin_router
from app.modules.business_network.router import router as business_network_router
from app.modules.chat.router import admin_router as chat_admin_router
from app.modules.chat.router import router as chat_router
from app.modules.commissions.router import admin_router as commissions_admin_router
from app.modules.commissions.router import router as commissions_router
from app.modules.disputes.router import admin_router as disputes_admin_router
from app.modules.disputes.router import router as disputes_router
from app.modules.fraud.router import router as fraud_router
from app.modules.fx.router import router as fx_router
from app.modules.guides.router import router as guides_router
from app.modules.locations.router import router as locations_router
from app.modules.loyalty.router import router as loyalty_router
from app.modules.notifications.router import admin_router as notifications_admin_router
from app.modules.notifications.router import router as notifications_router
from app.modules.partners.router import router as partners_router
from app.modules.payments.router import admin_router as payments_admin_router
from app.modules.payments.router import router as payments_router
from app.modules.payouts.router import admin_router as payouts_admin_router
from app.modules.payouts.router import router as payouts_router
from app.modules.profiles.router import router as profiles_router
from app.modules.promotions.router import admin_router as promotions_admin_router
from app.modules.promotions.router import router as promotions_router
from app.modules.rentcar.router import drivers_router as rentcar_drivers_router
from app.modules.rentcar.router import router as rentcar_router
from app.modules.reviews.router import router as reviews_router
from app.modules.search.router import router as search_router
from app.modules.stays.router import ical_router as stays_ical_router
from app.modules.stays.router import router as stays_router
from app.modules.stays.router import staff_router as stays_staff_router
from app.modules.tours.router import router as tours_router
from app.modules.users.router import router as users_router

settings = get_settings()

# Tag descriptions shown in the interactive docs (both the full /docs and the
# partner-filtered /partner-docs below) — most tags here are the public/traveler-
# and-partner-facing surface an external developer would actually use; `admin*`
# tags are internal-only and stripped entirely from /partner-docs (see below).
OPENAPI_TAGS = [
    {"name": "health", "description": "Uptime checks — no auth required."},
    {"name": "auth", "description": "Register, log in, refresh an access token, and verify email/phone via OTP."},
    {"name": "users", "description": "The current user's own profile."},
    {"name": "locations", "description": "The Country → Region → City → Attraction hierarchy every listing is tagged to."},
    {"name": "tours", "description": "Fixed-date tours run by Local Experts — CRUD for owners, browse for everyone."},
    {"name": "stays", "description": "Properties, room types, availability, and rate plans run by Hosts/Hotels."},
    {"name": "rent-a-car", "description": "Vehicles and drivers offered by Rent-a-Car partners."},
    {"name": "search", "description": "Cross-cutting search: date-filtered stays/vehicles, Local Experts, and destinations."},
    {"name": "bookings", "description": "Create and manage bookings spanning tours, stays, vehicles, and custom bids."},
    {"name": "payments", "description": "SSLCommerz checkout and bank-transfer payment flows."},
    {"name": "payouts", "description": "A partner's own payout history and balance."},
    {"name": "commissions", "description": "A partner's own earnings/commission breakdown."},
    {"name": "reviews", "description": "Traveler reviews left on a completed booking item."},
    {"name": "chat", "description": "In-app messaging between travelers and partners, plus REST + WebSocket message delivery."},
    {"name": "loyalty", "description": "A traveler's reward-points balance and history."},
    {"name": "promotions", "description": "Validate a promo code before checkout."},
    {"name": "fx", "description": "Live currency-conversion rates for display only — every booking is still charged in BDT."},
    {"name": "guides", "description": "Guide invitations and assignments a Local Expert manages."},
    {"name": "custom-tour-bidding", "description": "A traveler's custom trip request and the bids Local Experts submit on it."},
    {"name": "business-network", "description": "Partner-to-partner referrals."},
    {"name": "partners", "description": "Applying for and managing a partner role (Local Expert, Host, Rent-a-Car, ...)."},
    {"name": "badges", "description": "Trust badge applications a partner submits for admin review."},
    {"name": "notifications", "description": "A user's own in-app notification feed."},
    {"name": "ads", "description": "A partner's sponsored-placement ad campaigns, plus public sponsored-result placements."},
    {"name": "disputes", "description": "A traveler's dispute on a booking and its resolution."},
    {"name": "profiles", "description": "A Local Expert's public profile."},
    {"name": "analytics", "description": "A partner's own performance analytics."},
]

app = FastAPI(
    title="Ovigo API",
    description=(
        "Local Expert, Host & Stay Booking Platform — backend API.\n\n"
        "**Base URL (production):** `https://ovigo-api.salmandev.io`\n\n"
        "**Authentication:** most endpoints require a JWT bearer token from "
        "`POST /api/v1/auth/login` or `/register`, sent as `Authorization: Bearer <access_token>`. "
        "See [API_DOCUMENTATION.md](https://github.com/salman1237/Ovigo/blob/main/API_DOCUMENTATION.md) "
        "in the repo for a full external-partner guide, or browse "
        "[/partner-docs](/partner-docs) for a docs view scoped to the partner-relevant "
        "endpoints only (this page includes internal admin/staff endpoints too)."
    ),
    version="0.1.0",
    openapi_tags=OPENAPI_TAGS,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Baseline security headers on every response. This is a browser-facing API
    consumed by the Next.js frontend, not a page-rendering server, so there's no
    CSP here — a strict CSP is Next.js's job on its own responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(bidding_router)
app.include_router(bidding_bids_router)
app.include_router(guides_router)
app.include_router(business_network_router)
app.include_router(business_network_admin_router)
app.include_router(locations_router)
app.include_router(partners_router)
app.include_router(profiles_router)
app.include_router(tours_router)
app.include_router(stays_router)
app.include_router(stays_staff_router)
app.include_router(stays_ical_router)
app.include_router(rentcar_router)
app.include_router(rentcar_drivers_router)
app.include_router(search_router)
app.include_router(bookings_router)
app.include_router(front_desk_router)
app.include_router(payments_router)
app.include_router(payments_admin_router)
app.include_router(payouts_router)
app.include_router(payouts_admin_router)
app.include_router(commissions_router)
app.include_router(commissions_admin_router)
app.include_router(analytics_router)
app.include_router(ads_router)
app.include_router(ads_admin_router)
app.include_router(badges_router)
app.include_router(badges_admin_router)
app.include_router(reviews_router)
app.include_router(notifications_router)
app.include_router(notifications_admin_router)
app.include_router(chat_router)
app.include_router(chat_admin_router)
app.include_router(disputes_router)
app.include_router(disputes_admin_router)
app.include_router(fraud_router)
app.include_router(fx_router)
app.include_router(loyalty_router)
app.include_router(promotions_router)
app.include_router(promotions_admin_router)
app.include_router(admin_router)


@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    return {"status": "ok", "service": "ovigo-api", "environment": settings.environment}


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "healthy"}


# --- Partner-facing docs: the same schema as /docs, minus every /api/v1/admin/*
# path and the front-desk (property-staff) surface — neither is relevant to an
# external integration partner, and admin endpoints in particular shouldn't be
# advertised on a page meant to be shared outside the company. Path-prefix
# filtering (not tag filtering) since a couple of admin-only routers — e.g.
# fraud/router.py — don't carry an "admin" tag despite living under /admin/.
_INTERNAL_PATH_PREFIXES = ("/api/v1/admin", "/api/v1/properties/{property_id}/front-desk")


def _partner_openapi_schema() -> dict:
    full_schema = get_openapi(
        title="Ovigo Partner API",
        version=app.version,
        description="The subset of the Ovigo API relevant to an external integration partner — see API_DOCUMENTATION.md in the repo for a full guide.",
        routes=app.routes,
        tags=[t for t in OPENAPI_TAGS if t["name"] != "health"],
    )
    full_schema["paths"] = {
        path: item
        for path, item in full_schema["paths"].items()
        if not any(path.startswith(prefix) for prefix in _INTERNAL_PATH_PREFIXES)
    }
    return full_schema


@app.get("/api/v1/partner-docs/openapi.json", include_in_schema=False)
async def partner_openapi() -> JSONResponse:
    return JSONResponse(_partner_openapi_schema())


@app.get("/partner-docs", include_in_schema=False)
async def partner_docs():
    return get_swagger_ui_html(openapi_url="/api/v1/partner-docs/openapi.json", title="Ovigo Partner API Docs")
