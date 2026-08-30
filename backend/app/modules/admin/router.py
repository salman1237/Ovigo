import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.permissions import require_admin
from app.database import get_db
from app.modules.admin import service
from app.modules.admin.models import AuditLog
from app.modules.admin.schemas import AdminPartnerRoleRead, AuditLogRead, RejectRequest
from app.modules.partners.models import PartnerDocument
from app.modules.users.models import PartnerRoleStatus, User

router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/partners/roles", response_model=list[AdminPartnerRoleRead])
async def list_partner_roles(
    status: PartnerRoleStatus | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await service.list_roles(db, status)


@router.post("/partners/roles/{role_id}/approve", response_model=AdminPartnerRoleRead)
async def approve_partner_role(
    role_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.approve_role(db, current_user, role_id)


@router.post("/partners/roles/{role_id}/reject", response_model=AdminPartnerRoleRead)
async def reject_partner_role(
    role_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.reject_role(db, current_user, role_id, payload.reason)


@router.get("/partners/documents/{document_id}/file")
async def download_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PartnerDocument).where(PartnerDocument.id == document_id))
    document = result.scalar_one_or_none()
    if document is None:
        raise NotFoundError("Document not found")
    return Response(content=document.file_data, media_type=document.content_type)


@router.post("/partners/documents/{document_id}/verify")
async def verify_document(
    document_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await service.verify_document(db, current_user, document_id)
    return {"message": "Document verified"}


@router.post("/partners/documents/{document_id}/reject")
async def reject_document(
    document_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await service.reject_document(db, current_user, document_id, payload.reason)
    return {"message": "Document rejected"}


@router.get("/audit-logs", response_model=list[AuditLogRead])
async def list_audit_logs(limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
    return list(result.scalars().all())
