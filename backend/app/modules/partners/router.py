import uuid
from datetime import date

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
from app.modules.partners.models import OPTIONAL_DOCUMENT_TYPES, REQUIRED_DOCUMENT_TYPES, DocumentType
from app.modules.partners.schemas import (
    ROLE_DETAILS_SCHEMA,
    PartnerDocumentRead,
    PartnerRoleApplyRequest,
    PartnerRoleRead,
)
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/partners", tags=["partners"])


@router.get("/document-requirements", response_model=dict[str, list[DocumentType]])
async def get_document_requirements():
    """PRD §7 required-document mapping per role type. Public/static — no auth
    needed, lets the apply form and admin review UI render the same checklist
    the backend actually enforces at approval time, without duplicating it."""
    return REQUIRED_DOCUMENT_TYPES


@router.get("/optional-document-requirements", response_model=dict[str, list[DocumentType]])
async def get_optional_document_requirements():
    """Documents PRD §7 calls out as optional (e.g. a Local Expert's police
    verification) — offered in the wizard's Documents step but not gating approval."""
    return OPTIONAL_DOCUMENT_TYPES


@router.get("/role-field-requirements", response_model=dict[str, list[str]])
async def get_role_field_requirements():
    """Required PRD §7.2-§7.5 field names per role, generated from the same
    Pydantic models service.apply_for_role validates `role_details` against — so the
    wizard's required-field list can never drift from what the backend enforces."""
    return {
        role_type: [name for name, field in schema.model_fields.items() if field.is_required()]
        for role_type, schema in ROLE_DETAILS_SCHEMA.items()
    }


@router.post("/roles", response_model=PartnerRoleRead, status_code=201)
async def apply_for_role(
    payload: PartnerRoleApplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.apply_for_role(
        db,
        current_user,
        payload.role_type,
        payload.message,
        referral_code=payload.referral_code,
        accept_network_terms=payload.accept_network_terms,
        common_details={
            "full_legal_name": payload.full_legal_name,
            "contact_mobile_number": payload.contact_mobile_number,
            "national_id_type": payload.national_id_type,
            "national_id_number": payload.national_id_number,
            "permanent_address": payload.permanent_address,
            "current_address": payload.current_address,
            "emergency_contact_name": payload.emergency_contact_name,
            "emergency_contact_phone": payload.emergency_contact_phone,
            "payout_method": payload.payout_method,
            "payout_provider_name": payload.payout_provider_name,
            "payout_account_name": payload.payout_account_name,
            "payout_account_number": payload.payout_account_number,
            "tax_id": payload.tax_id,
            "agreed_to_partner_terms": payload.agreed_to_partner_terms,
            "agreed_to_background_check": payload.agreed_to_background_check,
        },
        role_details=payload.role_details,
    )


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
    expiry_date: date | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await service.get_own_role_or_404(db, current_user, role_id)
    file_data = await file.read()
    return await service.upload_document(
        db,
        role,
        document_type,
        file.filename or "upload",
        file.content_type or "application/octet-stream",
        file_data,
        expiry_date,
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
