"""Shared FastAPI dependencies, re-exported for convenient imports across modules."""
from app.core.permissions import require_admin, require_roles, require_super_admin
from app.database import get_db
from app.modules.auth.utils import get_current_user

__all__ = [
    "get_db",
    "get_current_user",
    "require_roles",
    "require_admin",
    "require_super_admin",
]
