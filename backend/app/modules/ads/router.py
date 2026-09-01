import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin, require_approved_role
from app.database import get_db
from app.modules.ads import service
from app.modules.ads.models import AdCampaignStatus
from app.modules.ads.schemas import (
    AdCampaignCreate,
    AdCampaignRead,
    AdCampaignStats,
    AdCampaignUpdate,
    AdminAdCampaignRead,
    AdRejectRequest,
    SponsoredResult,
)
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.locations.schemas import LocationTagRead, LocationTagSet
from app.modules.users.models import PartnerRole, PartnerRoleType, User

require_advertiser = require_approved_role(
    PartnerRoleType.LOCAL_EXPERT, PartnerRoleType.HOST, PartnerRoleType.HOTEL, PartnerRoleType.RENT_A_CAR
)

router = APIRouter(prefix="/api/v1/ads", tags=["ads"])
admin_router = APIRouter(prefix="/api/v1/admin/ads", tags=["admin-ads"], dependencies=[Depends(require_admin)])


@router.post("/campaigns", response_model=AdCampaignRead)
async def create_campaign(
    payload: AdCampaignCreate, role: PartnerRole = Depends(require_advertiser), db: AsyncSession = Depends(get_db)
):
    campaign = await service.create_campaign(db, role, payload)
    return await service.get_campaign_read(db, campaign)


@router.get("/campaigns/mine", response_model=list[AdCampaignRead])
async def list_my_campaigns(role: PartnerRole = Depends(require_advertiser), db: AsyncSession = Depends(get_db)):
    campaigns = await service.list_my_campaigns(db, role)
    return [await service.get_campaign_read(db, c) for c in campaigns]


@router.get("/campaigns/{campaign_id}", response_model=AdCampaignRead)
async def get_campaign(
    campaign_id: uuid.UUID, role: PartnerRole = Depends(require_advertiser), db: AsyncSession = Depends(get_db)
):
    campaign = await service.get_own_campaign_or_404(db, role, campaign_id)
    return await service.get_campaign_read(db, campaign)


@router.put("/campaigns/{campaign_id}", response_model=AdCampaignRead)
async def update_campaign(
    campaign_id: uuid.UUID,
    payload: AdCampaignUpdate,
    role: PartnerRole = Depends(require_advertiser),
    db: AsyncSession = Depends(get_db),
):
    campaign = await service.update_campaign(db, role, campaign_id, payload)
    return await service.get_campaign_read(db, campaign)


@router.post("/campaigns/{campaign_id}/locations", response_model=list[LocationTagRead])
async def set_campaign_locations(
    campaign_id: uuid.UUID,
    payload: LocationTagSet,
    role: PartnerRole = Depends(require_advertiser),
    db: AsyncSession = Depends(get_db),
):
    return await service.set_campaign_locations(db, role, campaign_id, payload.location_ids)


@router.get("/campaigns/{campaign_id}/locations", response_model=list[LocationTagRead])
async def get_campaign_locations(
    campaign_id: uuid.UUID, role: PartnerRole = Depends(require_advertiser), db: AsyncSession = Depends(get_db)
):
    await service.get_own_campaign_or_404(db, role, campaign_id)
    return await locations_service.get_tags(db, TaggableEntityType.AD_CAMPAIGN, campaign_id)


@router.post("/campaigns/{campaign_id}/submit", response_model=AdCampaignRead)
async def submit_campaign(
    campaign_id: uuid.UUID, role: PartnerRole = Depends(require_advertiser), db: AsyncSession = Depends(get_db)
):
    campaign = await service.submit_for_review(db, role, campaign_id)
    return await service.get_campaign_read(db, campaign)


@router.post("/campaigns/{campaign_id}/pause", response_model=AdCampaignRead)
async def pause_campaign(
    campaign_id: uuid.UUID, role: PartnerRole = Depends(require_advertiser), db: AsyncSession = Depends(get_db)
):
    campaign = await service.pause_campaign(db, role, campaign_id)
    return await service.get_campaign_read(db, campaign)


@router.post("/campaigns/{campaign_id}/resume", response_model=AdCampaignRead)
async def resume_campaign(
    campaign_id: uuid.UUID, role: PartnerRole = Depends(require_advertiser), db: AsyncSession = Depends(get_db)
):
    campaign = await service.resume_campaign(db, role, campaign_id)
    return await service.get_campaign_read(db, campaign)


@router.get("/campaigns/{campaign_id}/stats", response_model=AdCampaignStats)
async def get_campaign_stats(
    campaign_id: uuid.UUID, role: PartnerRole = Depends(require_advertiser), db: AsyncSession = Depends(get_db)
):
    return await service.get_campaign_stats(db, role, campaign_id)


# --- public: sponsored placements + click tracking ---


@router.get("/sponsored", response_model=list[SponsoredResult])
async def get_sponsored_results(
    location_slug: str | None = None,
    entity_type: TaggableEntityType | None = None,
    limit: int = 3,
    db: AsyncSession = Depends(get_db),
):
    location_ids: list[uuid.UUID] = []
    if location_slug:
        resolved = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if resolved is None:
            return []
        location_ids = resolved
    if not location_ids:
        return []
    return await service.get_sponsored_results(db, location_ids, entity_type, limit)


@router.post("/campaigns/{campaign_id}/click", status_code=204)
async def track_click(campaign_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await service.record_click(db, campaign_id)


# --- admin moderation ---


@admin_router.get("/campaigns", response_model=list[AdminAdCampaignRead])
async def admin_list_campaigns(
    status: AdCampaignStatus | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await service.list_admin_campaigns(db, status)


@admin_router.post("/campaigns/{campaign_id}/approve", response_model=AdminAdCampaignRead)
async def admin_approve_campaign(
    campaign_id: uuid.UUID, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    return await service.approve_campaign(db, admin, campaign_id)


@admin_router.post("/campaigns/{campaign_id}/reject", response_model=AdminAdCampaignRead)
async def admin_reject_campaign(
    campaign_id: uuid.UUID,
    payload: AdRejectRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.reject_campaign(db, admin, campaign_id, payload.reason)
