"""Shared helpers for the end-to-end tests that need a real Postgres
(OVIGO_DB_TESTS=1 — see tests/test_referral_network.py's docstring). The `api`
fixture lives in conftest.py."""
import os
import uuid
from decimal import Decimal

import pytest

db_tests = pytest.mark.skipif(os.environ.get("OVIGO_DB_TESTS") != "1", reason="set OVIGO_DB_TESTS=1 with a Postgres DATABASE_URL")


async def session():
    from app.database import AsyncSessionLocal

    return AsyncSessionLocal()


def unique_email(tag: str) -> str:
    return f"{tag}-{uuid.uuid4().hex[:10]}@test.ovigo"


async def register(api, name: str, referral_code: str | None = None) -> tuple[str, dict]:
    payload = {"full_name": name, "email": unique_email(name.lower().replace(" ", "-")), "password": "password123"}
    if referral_code:
        payload["referral_code"] = referral_code
    r = await api.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    return body["access_token"], body["user"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def admin_token(api) -> str:
    from app.modules.users.models import SystemRole, User

    token, user = await register(api, "Admin")
    async with await session() as db:
        db_user = await db.get(User, uuid.UUID(user["id"]))
        db_user.system_role = SystemRole.SUPER_ADMIN
        await db.commit()
    return token


def _role_details(role_type: str) -> dict:
    if role_type == "local_expert":
        return {
            "primary_destination": "Bandarban",
            "secondary_destinations": ["Rangamati"],
            "years_experience": 5,
            "languages": ["Bangla", "English"],
            "training_background": "Tourism board certified guide training",
            "local_references": "Jane Doe, +8801700000000",
            "expertise_categories": ["trekking"],
            "emergency_handling_capability": True,
        }
    if role_type == "guide":
        return {
            "languages": ["Bangla", "English"],
            "service_locations": "Bandarban, Rangamati",
            "expertise": ["trekking"],
            "years_experience": 3,
        }
    if role_type in ("host", "hotel"):
        return {
            "ownership_type": "owner",
            "property_address": "House 12, Road 5, Cox's Bazar",
            "fire_safety_info": "Fire extinguishers on every floor, clear exits",
            "cancellation_policy_agreement": True,
            "guest_registration_compliance": True,
        }
    if role_type == "rent_a_car":
        return {"service_area": "Dhaka city", "emergency_support_number": "+8801700000001"}
    return {}


def _common_application_fields() -> dict:
    return {
        "full_legal_name": "Test Partner",
        "contact_mobile_number": "+8801700000000",
        "national_id_type": "id_card",
        "national_id_number": "1234567890",
        "permanent_address": "Test permanent address",
        "current_address": "Test current address",
        "emergency_contact_name": "Emergency Contact",
        "emergency_contact_phone": "+8801700000002",
        "payout_method": "bank",
        "payout_provider_name": "Test Bank",
        "payout_account_name": "Test Partner",
        "payout_account_number": "0000000000",
        "agreed_to_partner_terms": True,
        "agreed_to_background_check": True,
    }


async def apply(api, token: str, role_type: str, **extra):
    payload = {
        "role_type": role_type,
        **_common_application_fields(),
        "role_details": _role_details(role_type),
        **extra,
    }
    return await api.post("/api/v1/partners/roles", json=payload, headers=auth(token))


async def upload_required_documents(api, token: str, role_id: str, role_type: str) -> None:
    from app.modules.partners.models import REQUIRED_DOCUMENT_TYPES

    for document_type in REQUIRED_DOCUMENT_TYPES.get(role_type, []):
        r = await api.post(
            f"/api/v1/partners/roles/{role_id}/documents",
            data={"document_type": document_type.value},
            files={"file": ("doc.txt", b"test document", "text/plain")},
            headers=auth(token),
        )
        assert r.status_code == 201, r.text


async def approved_partner(api, admin: str, name: str, role_type: str, **extra) -> tuple[str, dict, str]:
    token, user = await register(api, name)
    r = await apply(api, token, role_type, **extra)
    assert r.status_code == 201, r.text
    role_id = r.json()["id"]
    await upload_required_documents(api, token, role_id, role_type)
    r = await api.post(f"/api/v1/admin/partners/roles/{role_id}/approve", headers=auth(admin))
    assert r.status_code == 200, r.text
    return token, user, role_id


async def approved_expert(api, admin: str, name: str = "Expert Karim") -> tuple[str, dict, str]:
    return await approved_partner(api, admin, name, "local_expert")


async def commissions_for_item(item_id):
    from sqlalchemy import select

    from app.modules.commissions.models import Commission

    async with await session() as db:
        rows = (await db.execute(select(Commission).where(Commission.booking_item_id == item_id))).scalars().all()
        return {c.source.value: c for c in rows}


async def run_commissions(booking_id) -> None:
    """The real commission engine, as payments/service.py runs it on payment success."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.modules.bookings.models import Booking
    from app.modules.commissions import service as commissions_service

    async with await session() as db:
        booking = (
            await db.execute(select(Booking).where(Booking.id == booking_id).options(selectinload(Booking.items)))
        ).scalar_one()
        await commissions_service.create_commissions_for_booking(db, booking)
        await db.commit()


MONEY = Decimal("0.01")
