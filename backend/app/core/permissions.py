"""RBAC foundation.

Phase 1 keeps this intentionally simple: every user has a `system_role` (traveler / admin /
super_admin) plus zero or more approved `PartnerRole`s (local_expert, host, guide, hotel,
rent_a_car) once partner onboarding (Sprint 3-4) exists. `require_roles` is a dependency
factory used to gate routes; it is the seam that later, more granular permission rules
(§24 of the technical document) will plug into without changing every router.
"""
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, PartnerRoleType, SystemRole, User


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


def require_approved_role(*role_types: PartnerRoleType):
    """Dependency factory: current user must hold an APPROVED partner role of one of the
    given types. Returns that PartnerRole (so handlers get the role_id for free) rather
    than just the user — this is the seam every listing-creation endpoint (tours,
    properties, ...) hangs off of."""

    async def dependency(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> PartnerRole:
        result = await db.execute(
            select(PartnerRole)
            .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(
                PartnerAccount.user_id == current_user.id,
                PartnerRole.role_type.in_(role_types),
                PartnerRole.status == PartnerRoleStatus.APPROVED,
            )
        )
        role = result.scalars().first()
        if role is None:
            allowed = ", ".join(rt.value for rt in role_types)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires an approved partner role of type: {allowed}",
            )
        return role

    return dependency
