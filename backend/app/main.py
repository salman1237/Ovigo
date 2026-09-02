"""FastAPI application entrypoint."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
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
from app.modules.guides.router import router as guides_router
from app.modules.locations.router import router as locations_router
from app.modules.notifications.router import admin_router as notifications_admin_router
from app.modules.notifications.router import router as notifications_router
from app.modules.partners.router import router as partners_router
from app.modules.payments.router import admin_router as payments_admin_router
from app.modules.payments.router import router as payments_router
from app.modules.payouts.router import admin_router as payouts_admin_router
from app.modules.payouts.router import router as payouts_router
from app.modules.profiles.router import router as profiles_router
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

app = FastAPI(
    title="Ovigo API",
    description="Local Expert, Host & Stay Booking Platform — backend API",
    version="0.1.0",
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
app.include_router(admin_router)


@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    return {"status": "ok", "service": "ovigo-api", "environment": settings.environment}


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "healthy"}
