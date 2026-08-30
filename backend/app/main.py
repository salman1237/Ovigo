"""FastAPI application entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.bookings.router import router as bookings_router
from app.modules.commissions.router import router as commissions_router
from app.modules.locations.router import router as locations_router
from app.modules.partners.router import router as partners_router
from app.modules.payments.router import router as payments_router
from app.modules.profiles.router import router as profiles_router
from app.modules.reviews.router import router as reviews_router
from app.modules.search.router import router as search_router
from app.modules.stays.router import router as stays_router
from app.modules.tours.router import router as tours_router
from app.modules.users.router import router as users_router

settings = get_settings()

app = FastAPI(
    title="Ovigo API",
    description="Local Expert, Host & Stay Booking Platform — backend API",
    version="0.1.0",
)

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
app.include_router(locations_router)
app.include_router(partners_router)
app.include_router(profiles_router)
app.include_router(tours_router)
app.include_router(stays_router)
app.include_router(search_router)
app.include_router(bookings_router)
app.include_router(payments_router)
app.include_router(commissions_router)
app.include_router(reviews_router)
app.include_router(admin_router)


@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    return {"status": "ok", "service": "ovigo-api", "environment": settings.environment}


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "healthy"}
