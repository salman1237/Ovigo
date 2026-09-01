import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.ads.models import AdBillingModel, AdCampaignStatus, AdPlacementType
from app.modules.locations.models import TaggableEntityType

_ADVERTISABLE_ENTITY_TYPES = {TaggableEntityType.TOUR, TaggableEntityType.PROPERTY, TaggableEntityType.VEHICLE}


class AdCampaignCreate(BaseModel):
    entity_type: TaggableEntityType
    entity_id: uuid.UUID
    placement_type: AdPlacementType
    billing_model: AdBillingModel
    bid_amount: Decimal = Field(gt=0)
    budget_total: Decimal = Field(gt=0)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def _check_entity_type(self):
        if self.entity_type not in _ADVERTISABLE_ENTITY_TYPES:
            raise ValueError("Only tours, properties and vehicles can be advertised")
        if self.end_date is not None and self.start_date is not None and self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class AdCampaignUpdate(BaseModel):
    bid_amount: Decimal | None = Field(default=None, gt=0)
    budget_total: Decimal | None = Field(default=None, gt=0)
    start_date: date | None = None
    end_date: date | None = None


class AdCampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    partner_role_id: uuid.UUID
    entity_type: TaggableEntityType
    entity_id: uuid.UUID
    entity_title: str
    placement_type: AdPlacementType
    billing_model: AdBillingModel
    bid_amount: Decimal
    budget_total: Decimal
    budget_spent: Decimal
    status: AdCampaignStatus
    rejection_reason: str | None
    start_date: date | None
    end_date: date | None
    impressions_count: int
    clicks_count: int
    created_at: datetime
    updated_at: datetime


class AdCampaignStats(BaseModel):
    impressions_count: int
    clicks_count: int
    click_through_rate: float
    budget_total: Decimal
    budget_spent: Decimal
    budget_remaining: Decimal


class AdApplicant(BaseModel):
    full_name: str
    email: str | None
    phone: str | None


class AdminAdCampaignRead(AdCampaignRead):
    applicant: AdApplicant


class AdRejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class SponsoredResult(BaseModel):
    """What search/listing pages actually render — deliberately thin (just enough to
    render a labeled sponsored card and link through), not the full AdCampaignRead a
    partner or admin would see."""

    campaign_id: uuid.UUID
    entity_type: TaggableEntityType
    entity_id: uuid.UUID
    entity_title: str
