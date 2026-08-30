import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.locations.schemas import LocationTagRead, LocationTagSet
from app.modules.partners import service
from app.modules.partners.models import DocumentType
from app.modules.partners.schemas import (
    PartnerDocumentRead,
    PartnerRoleApplyRequest,
    PartnerRoleRead,
)
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/partners", tags=["partners"])


@router.post("/roles", response_model=PartnerRoleRead, status_code=201)
async def apply_for_role(
    payload: PartnerRoleApplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.apply_for_role(db, current_user, payload.role_type, payload.message)


@router.get("/roles", response_model=list[PartnerRoleRead])
async def list_my_roles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_roles(db, current_user)


@router.get("/roles/{role_id}", response_model=PartnerRoleRead)
async def get_my_role(
    role_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_own_role_or_404(db, current_user, role_id)


@router.post("/roles/{role_id}/documents", response_model=PartnerDocumentRead, status_code=201)
async def upload_document(
    role_id: uuid.UUID,
    document_type: DocumentType = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await service.get_own_role_or_404(db, current_user, role_id)
    file_data = await file.read()
    return await service.upload_document(
        db, role, document_type, file.filename or "upload", file.content_type or "application/octet-stream", file_data
    )


@router.get("/roles/{role_id}/documents/{document_id}/file")
async def download_own_document(
    role_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await service.get_own_role_or_404(db, current_user, role_id)
    document = next((d for d in role.documents if d.id == document_id), None)
    if document is None:
        raise NotFoundError("Document not found")
    return Response(content=document.file_data, media_type=document.content_type)


@router.post("/roles/{role_id}/locations", response_model=list[LocationTagRead])
async def set_role_locations(
    role_id: uuid.UUID,
    payload: LocationTagSet,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await service.get_own_role_or_404(db, current_user, role_id)
    return await locations_service.set_tags(db, TaggableEntityType.PARTNER_ROLE, role.id, payload.location_ids)


@router.get("/roles/{role_id}/locations", response_model=list[LocationTagRead])
async def get_role_locations(
    role_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await service.get_own_role_or_404(db, current_user, role_id)
    return await locations_service.get_tags(db, TaggableEntityType.PARTNER_ROLE, role.id)
