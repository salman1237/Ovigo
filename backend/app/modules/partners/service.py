import uuid
from datetime import date

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.core.exceptions import ValidationError as AppValidationError
from app.modules.partners.models import DocumentType, PartnerDocument, PartnerRoleApplication
from app.modules.partners.schemas import ROLE_DETAILS_SCHEMA
from app.modules.referrals import service as referrals_service
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, PartnerRoleType, User

MAX_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024  # 5MB — see partners/models.py docstring on storage choice


async def get_or_create_partner_account(db: AsyncSession, user: User) -> PartnerAccount:
    result = await db.execute(select(PartnerAccount).where(PartnerAccount.user_id == user.id))
    account = result.scalar_one_or_none()
    if account is None:
        account = PartnerAccount(user_id=user.id)
        db.add(account)
        await db.commit()
        await db.refresh(account)
    return account


def _validate_role_details(role_type: PartnerRoleType, role_details: dict) -> dict:
    """PRD §7.2-§7.5 fields are role-specific — validate `role_details` against the
    matching model in ROLE_DETAILS_SCHEMA (schemas.py) rather than trusting the client,
    same defense-in-depth principle as the document-completeness gate."""
    schema = ROLE_DETAILS_SCHEMA.get(role_type.value)
    if schema is None:
        return role_details
    try:
        validated = schema.model_validate(role_details)
    except PydanticValidationError as exc:
        missing = ", ".join(".".join(str(p) for p in err["loc"]) for err in exc.errors())
        raise AppValidationError(f"Missing or invalid application details: {missing}") from exc
    return validated.model_dump(mode="json")


async def apply_for_role(
    db: AsyncSession,
    user: User,
    role_type: PartnerRoleType,
    message: str | None,
    referral_code: str | None = None,
    accept_network_terms: bool = False,
    common_details: dict | None = None,
    role_details: dict | None = None,
) -> PartnerRole:
    common_details = common_details or {}
    role_details = _validate_role_details(role_type, role_details or {})

    # Resolve the referral link first, so a code that can't apply is rejected before
    # anything (partner account, role row) gets written.
    referral_link, terms_accepted = await referrals_service.validate_for_application(
        db, user, role_type, referral_code, accept_network_terms
    )
    account = await get_or_create_partner_account(db, user)

    result = await db.execute(
        select(PartnerRole).where(
            PartnerRole.partner_account_id == account.id, PartnerRole.role_type == role_type
        )
    )
    role = result.scalar_one_or_none()

    if role is not None:
        if role.status == PartnerRoleStatus.PENDING:
            raise ConflictError(f"A {role_type.value} application is already pending review")
        if role.status == PartnerRoleStatus.APPROVED:
            raise ConflictError(f"You already hold an approved {role_type.value} role")
        if role.status == PartnerRoleStatus.SUSPENDED:
            raise ConflictError("This role is suspended — contact support")
        # REJECTED: allow re-application
        role.status = PartnerRoleStatus.PENDING
        role.approved_at = None
    else:
        role = PartnerRole(partner_account_id=account.id, role_type=role_type)
        db.add(role)
        await db.flush()

    application = PartnerRoleApplication(partner_role_id=role.id, message=message, role_details=role_details, **common_details)
    db.add(application)
    await referrals_service.attach_to_application(db, user, role, referral_link, terms_accepted)
    await db.commit()
    return await get_own_role_or_404(db, user, role.id)


async def list_my_roles(db: AsyncSession, user: User) -> list[PartnerRole]:
    result = await db.execute(select(PartnerAccount).where(PartnerAccount.user_id == user.id))
    account = result.scalar_one_or_none()
    if account is None:
        return []
    result = await db.execute(
        select(PartnerRole)
        .where(PartnerRole.partner_account_id == account.id)
        .options(selectinload(PartnerRole.applications), selectinload(PartnerRole.documents))
    )
    return list(result.scalars().all())


async def get_own_role_or_404(db: AsyncSession, user: User, role_id: uuid.UUID) -> PartnerRole:
    result = await db.execute(
        select(PartnerRole)
        .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == role_id, PartnerAccount.user_id == user.id)
        .options(selectinload(PartnerRole.applications), selectinload(PartnerRole.documents))
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise NotFoundError("Partner role not found")
    return role


async def upload_document(
    db: AsyncSession,
    role: PartnerRole,
    document_type: DocumentType,
    file_name: str,
    content_type: str,
    file_data: bytes,
    expiry_date: date | None = None,
) -> PartnerDocument:
    if len(file_data) > MAX_DOCUMENT_SIZE_BYTES:
        raise ConflictError("File exceeds the 5MB upload limit")

    document = PartnerDocument(
        partner_role_id=role.id,
        document_type=document_type,
        file_name=file_name,
        content_type=content_type,
        file_data=file_data,
        expiry_date=expiry_date,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document
