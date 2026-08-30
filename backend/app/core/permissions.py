"""RBAC foundation.

Phase 1 keeps this intentionally simple: every user has a `system_role` (traveler / admin /
super_admin) plus zero or more approved `PartnerRole`s (local_expert, host, guide, hotel,
rent_a_car) once partner onboarding (Sprint 3-4) exists. `require_roles` is a dependency
factory used to gate routes; it is the seam that later, more granular permission rules
(§24 of the technical document) will plug into without changing every router.
"""
from enum import Enum

from fastapi import Depends, HTTPException, status

from app.modules.auth.utils import get_current_user
from app.modules.users.models import SystemRole, User


class PartnerRoleType(str, Enum):
    LOCAL_EXPERT = "local_expert"
    HOST = "host"
    GUIDE = "guide"
    HOTEL = "hotel"
    RENT_A_CAR = "rent_a_car"


def require_roles(*allowed: SystemRole):
    """Dependency factory: raise 403 unless the current user's system_role is in `allowed`."""

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.system_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return dependency


require_admin = require_roles(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
require_super_admin = require_roles(SystemRole.SUPER_ADMIN)
