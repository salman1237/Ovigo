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
        "verification.view",
        "verification.approve",
        "tours.view",
        "tours.approve",
        "tours.suspend",
        "vehicles.view",
        "vehicles.approve",
        "vehicles.suspend",
        "properties.view",
        "properties.approve",
        "properties.suspend",
    },
    AdminPermissionRole.SUPPORT: {
        "bookings.view",
        "disputes.view",
        "disputes.resolve",
        "verification.view",
        "tours.view",
        "vehicles.view",
        "properties.view",
    },
    AdminPermissionRole.MODERATOR: {
        "content.moderate",
        "verification.view",
        "tours.view",
        "tours.approve",
        "tours.suspend",
        "vehicles.view",
        "vehicles.approve",
        "vehicles.suspend",
        "properties.view",
        "properties.approve",
        "properties.suspend",
    },
    AdminPermissionRole.VERIFICATION_TEAM: {
        "verification.view",
        "verification.approve",
        "partners.suspend",
    },
}

ALL_PERMISSIONS_CATALOG = [
    {
        "category": "Partner Verification & KYC",
        "permissions": [
            {"id": "verification.view", "label": "View Partner Applications", "description": "Review submitted partner KYC documents and profiles"},
            {"id": "verification.approve", "label": "Approve / Reject Partners", "description": "Approve, reject, or request reverification of partner roles"},
            {"id": "partners.suspend", "label": "Suspend / Reinstate Partners", "description": "Temporarily suspend or reinstate partner roles and accounts"},
        ],
    },
    {
        "category": "Tours & Activities",
        "permissions": [
            {"id": "tours.view", "label": "View Tour Applications", "description": "Inspect tour details, itineraries, and logistics"},
            {"id": "tours.approve", "label": "Approve / Reject Tours", "description": "Approve or reject submitted tour packages"},
            {"id": "tours.suspend", "label": "Suspend / Reinstate Tours", "description": "Suspend active tours or reinstate suspended tours"},
        ],
    },
    {
        "category": "Rent-a-Car & Fleet",
        "permissions": [
            {"id": "vehicles.view", "label": "View Vehicle Listings", "description": "Inspect vehicles and fleet registration documents"},
            {"id": "vehicles.approve", "label": "Approve / Reject Vehicles", "description": "Approve or reject submitted vehicles"},
            {"id": "vehicles.suspend", "label": "Suspend / Reinstate Vehicles", "description": "Suspend active vehicle listings or reinstate them"},
        ],
    },
    {
        "category": "Stays & Accommodations",
        "permissions": [
            {"id": "properties.view", "label": "View Property Listings", "description": "Inspect hotels, resorts, and vacation rentals"},
            {"id": "properties.approve", "label": "Approve / Reject Properties", "description": "Approve or reject submitted stay properties"},
            {"id": "properties.suspend", "label": "Suspend / Reinstate Properties", "description": "Suspend active property listings"},
        ],
    },
    {
        "category": "Bookings & Operations",
        "permissions": [
            {"id": "bookings.view", "label": "View All Bookings", "description": "Inspect cross-vertical booking records and details"},
            {"id": "bookings.manage", "label": "Manage & Cancel Bookings", "description": "Cancel bookings and trigger operational overrides"},
        ],
    },
    {
        "category": "Financials & Payouts",
        "permissions": [
            {"id": "payouts.view", "label": "View Payout Requests", "description": "Inspect partner earnings and payout batches"},
            {"id": "payouts.process", "label": "Process Payouts", "description": "Disburse bank transfers and approve payout requests"},
            {"id": "commission_rules.view", "label": "View Commission Rules", "description": "Inspect platform take rates and commission tiers"},
            {"id": "commission_rules.write", "label": "Modify Commission Rules", "description": "Edit platform commission rules and fee structures"},
            {"id": "referrals.commission", "label": "Manage Referral Commissions", "description": "Manage B2B referral revenue sharing"},
        ],
    },
    {
        "category": "Disputes & Trust",
        "permissions": [
            {"id": "disputes.view", "label": "View Disputes & Claims", "description": "Review traveler-partner disputes and claims"},
            {"id": "disputes.resolve", "label": "Resolve Disputes", "description": "Issue arbitrations, payouts, and dispute resolutions"},
            {"id": "fraud.view", "label": "View Fraud Alerts", "description": "Inspect risk scoring and suspicious velocity alerts"},
            {"id": "fraud.manage", "label": "Manage Fraud Rules", "description": "Update blacklist, block IPs, and configure fraud thresholds"},
        ],
    },
    {
        "category": "Users & Account Governance",
        "permissions": [
            {"id": "users.view", "label": "View User Directory", "description": "Browse registered travelers, partners, and staff"},
            {"id": "users.suspend", "label": "Suspend / Ban Users", "description": "Freeze user accounts and restrict marketplace access"},
        ],
    },
    {
        "category": "Content & Marketing",
        "permissions": [
            {"id": "content.moderate", "label": "General Content Moderation", "description": "Review user reviews, comments, and media"},
            {"id": "cms.manage", "label": "Manage CMS & Content", "description": "Edit homepage banners, FAQ, and destination pages"},
            {"id": "ads.manage", "label": "Manage Sponsored Ads", "description": "Approve and review partner ad campaigns"},
            {"id": "badges.manage", "label": "Manage Trust Badges", "description": "Review and award verified partner badges"},
        ],
    },
    {
        "category": "Admin & Team Management",
        "permissions": [
            {"id": "admins.manage", "label": "Manage Admin Roles & Access", "description": "Grant or restrict permissions for other admin moderators"},
            {"id": "reports.export", "label": "Export Financial & Analytics Reports", "description": "Export CSV/Excel reports and audit logs"},
        ],
    },
]


def require_admin_permission(permission: str):
    """Dependency factory: SUPER_ADMIN always passes.
    An ADMIN with custom `admin_permissions` configured must have `permission` in their list.
    An ADMIN with a predefined `admin_permission_role` must have `permission` in that role's set.
    An ADMIN with neither set retains full legacy access."""

    def dependency(current_user: User = Depends(require_admin)) -> User:
        if current_user.system_role == SystemRole.SUPER_ADMIN:
            return current_user

        # 1. Custom granular permissions assigned by Super Admin
        if current_user.admin_permissions is not None:
            user_perms = set(current_user.admin_permissions)
            if permission in user_perms:
                return current_user
            # Content moderation backward compatibility
            if "content.moderate" in user_perms and permission in {
                "tours.view", "tours.approve", "tours.suspend",
                "vehicles.view", "vehicles.approve", "vehicles.suspend",
                "properties.view", "properties.approve", "properties.suspend",
            }:
                return current_user
            if "verification.approve" in user_perms and permission in {
                "partners.suspend", "verification.view"
            }:
                return current_user
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Restricted access: you do not have permission for '{permission}'",
            )

        # 2. Preset role-based permissions
        if current_user.admin_permission_role is not None:
            allowed = PERMISSIONS.get(current_user.admin_permission_role, set())
            if permission in allowed:
                return current_user
            if "content.moderate" in allowed and permission in {
                "tours.view", "tours.approve", "tours.suspend",
                "vehicles.view", "vehicles.approve", "vehicles.suspend",
                "properties.view", "properties.approve", "properties.suspend",
            }:
                return current_user
            if "verification.approve" in allowed and permission in {
                "partners.suspend", "verification.view"
            }:
                return current_user
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your admin role ({current_user.admin_permission_role.value}) doesn't include: {permission}",
            )

        return current_user

    return dependency
