import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.partners.models import DocumentType, PartnerDocument, PartnerRoleApplication
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


async def apply_for_role(
    db: AsyncSession, user: User, role_type: PartnerRoleType, message: str | None
) -> PartnerRole:
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

    application = PartnerRoleApplication(partner_role_id=role.id, message=message)
    db.add(application)
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
) -> PartnerDocument:
    if len(file_data) > MAX_DOCUMENT_SIZE_BYTES:
        raise ConflictError("File exceeds the 5MB upload limit")

    document = PartnerDocument(
        partner_role_id=role.id,
        document_type=document_type,
        file_name=file_name,
        content_type=content_type,
        file_data=file_data,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document
