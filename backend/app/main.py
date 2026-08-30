"""FastAPI application entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.locations.router import router as locations_router
from app.modules.partners.router import router as partners_router
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
app.include_router(admin_router)


@app.get("/", tags=["health"])
async def root() -> dict[str, str]:
    return {"status": "ok", "service": "ovigo-api", "environment": settings.environment}


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "healthy"}
