"""Granular admin permissions — the layer *inside* SystemRole.ADMIN that
require_admin (core/permissions.py) doesn't distinguish. Before this, every admin
endpoint required exactly the same thing: system_role in {ADMIN, SUPER_ADMIN} — a
Finance Admin, Support agent and Moderator were all indistinguishable from a Super
Admin, which is exactly what the product feedback flagged ("Admin and Super Admin
are functionally similar").

Design: SUPER_ADMIN always bypasses this check entirely (it's the one role meant to
have unrestricted access). An ADMIN with `admin_permission_role` unset (the default,
and every admin account that existed before this feature) keeps full legacy access
to everything — setting this field only ever narrows access for that one account,
so rolling this out can't silently lock out an existing admin. An ADMIN with a
specific AdminPermissionRole is restricted to exactly the permissions listed for
that role below.

Scope note: this is deliberately applied to a representative, high-value subset of
admin endpoints (payouts, commission rules, partner/document verification, business
referrals, disputes, fraud, listing moderation, user suspension) matching the
product feedback's own worked examples almost 1:1 — not every admin endpoint in the
codebase has been retrofitted with a permission check. Anything not listed here
still just requires require_admin (any ADMIN or SUPER_ADMIN), unchanged from before.
"""
from fastapi import Depends, HTTPException, status

from app.core.permissions import require_admin
from app.modules.users.models import AdminPermissionRole, SystemRole, User

PERMISSIONS: dict[AdminPermissionRole, set[str]] = {
    AdminPermissionRole.FINANCE_ADMIN: {
        "payouts.view",
        "payouts.process",
        "commission_rules.view",
        "commission_rules.write",
        "referrals.commission",
    },
    AdminPermissionRole.OPERATIONS_ADMIN: {
        "payouts.view",
        "commission_rules.view",
        "bookings.view",
        "disputes.view",
        "disputes.resolve",
        "fraud.view",
        "referrals.manage",
        "users.suspend",
        "guides.certify",
        "guides.restrict",
    },
    AdminPermissionRole.SUPPORT: {
        "bookings.view",
        "disputes.view",
        "disputes.resolve",
        "verification.view",
    },
    AdminPermissionRole.MODERATOR: {
        "content.moderate",
        "verification.view",
    },
    AdminPermissionRole.VERIFICATION_TEAM: {
        "verification.view",
        "verification.approve",
    },
}


def require_admin_permission(permission: str):
    """Dependency factory: SUPER_ADMIN and any ADMIN with no admin_permission_role
    set always pass. An ADMIN with a specific role must have `permission` in that
    role's set from PERMISSIONS above."""

    def dependency(current_user: User = Depends(require_admin)) -> User:
        if current_user.system_role == SystemRole.SUPER_ADMIN:
            return current_user
        if current_user.admin_permission_role is None:
            return current_user
        allowed = PERMISSIONS.get(current_user.admin_permission_role, set())
        if permission not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your admin role ({current_user.admin_permission_role.value}) doesn't include: {permission}",
            )
        return current_user

    return dependency
