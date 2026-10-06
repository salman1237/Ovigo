import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.partners.models import ApplicationStatus, DocumentStatus, DocumentType, NationalIdType, PayoutMethod
from app.modules.users.models import PartnerRoleStatus, PartnerRoleType


class LocalExpertApplicationDetails(BaseModel):
    primary_destination: str = Field(min_length=1)
    secondary_destinations: list[str] = []
    years_experience: int = Field(ge=0)
    languages: list[str] = Field(min_length=1)
    training_background: str = Field(min_length=1)
    local_references: str = Field(min_length=1)
    expertise_categories: list[str] = Field(min_length=1)
    emergency_handling_capability: bool


class HostApplicationDetails(BaseModel):
    ownership_type: str = Field(min_length=1)  # "owner" | "lease" | "management"
    property_address: str = Field(min_length=1)
    fire_safety_info: str = Field(min_length=1)
    cancellation_policy_agreement: bool
    guest_registration_compliance: bool


class GuideApplicationDetails(BaseModel):
    languages: list[str] = Field(min_length=1)
    service_locations: str = Field(min_length=1)
    expertise: list[str] = Field(min_length=1)
    years_experience: int = Field(ge=0)
    supervising_expert_referral_code: str | None = None


class RentACarApplicationDetails(BaseModel):
    service_area: str = Field(min_length=1)
    emergency_support_number: str = Field(min_length=1)


# Keyed by the PartnerRoleType string value, same convention as REQUIRED_DOCUMENT_TYPES
# (partners/models.py) — picks the Pydantic model `role_details` must validate against
# for a given role, so the backend enforces exactly the PRD §7.2-§7.5 fields the
# frontend wizard collects, without the two ever drifting apart.
ROLE_DETAILS_SCHEMA: dict[str, type[BaseModel]] = {
    "local_expert": LocalExpertApplicationDetails,
    "guide": GuideApplicationDetails,
    "host": HostApplicationDetails,
    "hotel": HostApplicationDetails,
    "rent_a_car": RentACarApplicationDetails,
}


class PartnerRoleApplyRequest(BaseModel):
    role_type: PartnerRoleType
    message: str | None = None
    # Joining through a Local Expert's referral link (referrals/service.py). The
    # network terms must be accepted whenever a code is sent.
    referral_code: str | None = Field(default=None, max_length=32)
    accept_network_terms: bool = False

    # PRD §7.1 common verification fields.
    full_legal_name: str = Field(min_length=1)
    contact_mobile_number: str = Field(min_length=1)
    national_id_type: NationalIdType
    national_id_number: str = Field(min_length=1)
    permanent_address: str = Field(min_length=1)
    current_address: str = Field(min_length=1)
    emergency_contact_name: str = Field(min_length=1)
    emergency_contact_phone: str = Field(min_length=1)
    payout_method: PayoutMethod
    payout_provider_name: str = Field(min_length=1)
    payout_account_name: str = Field(min_length=1)
    payout_account_number: str = Field(min_length=1)
    tax_id: str | None = None
    agreed_to_partner_terms: bool
    agreed_to_background_check: bool

    # PRD §7.2-§7.5 role-specific fields — validated against ROLE_DETAILS_SCHEMA[role_type]
    # in service.apply_for_role (can't pick the right sub-model here: role_type is a
    # sibling field, not known until the whole payload is parsed).
    role_details: dict = {}


class PartnerRoleApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ApplicationStatus
    message: str | None
    full_legal_name: str | None
    contact_mobile_number: str | None
    national_id_type: NationalIdType | None
    national_id_number: str | None
    permanent_address: str | None
    current_address: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    payout_method: PayoutMethod | None
    payout_provider_name: str | None
    payout_account_name: str | None
    payout_account_number: str | None
    tax_id: str | None
    agreed_to_partner_terms: bool
    agreed_to_background_check: bool
    role_details: dict | None
    rejection_reason: str | None
    created_at: datetime


class PartnerDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_type: DocumentType
    file_name: str
    content_type: str
    status: DocumentStatus
    rejection_reason: str | None
    expiry_date: date | None
    created_at: datetime


class PartnerRoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role_type: PartnerRoleType
    status: PartnerRoleStatus
    approved_at: datetime | None
    created_at: datetime
    applications: list[PartnerRoleApplicationRead] = []
    documents: list[PartnerDocumentRead] = []
