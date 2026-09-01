"""Ad campaign lifecycle, targeting and spend accounting. See models.py for the
overall design and deliberate scope trims (flag-only budget, no creative-asset
pipeline, no audience targeting, aggregate counters not an event log).
"""
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.ads.models import AdBillingModel, AdCampaign, AdCampaignStatus
from app.modules.ads.schemas import (
    AdApplicant,
    AdCampaignCreate,
    AdCampaignRead,
    AdCampaignStats,
    AdCampaignUpdate,
    AdminAdCampaignRead,
    SponsoredResult,
)
from app.modules.locations import service as locations_service
from app.modules.locations.models import LocationTag, TaggableEntityType
from app.modules.rentcar.models import Vehicle, VehicleStatus
from app.modules.stays.models import Property, PropertyStatus
from app.modules.tours.models import Tour, TourStatus
from app.modules.users.models import PartnerAccount, PartnerRole, User

_MILLE = Decimal("1000")


async def _resolve_entity(
    db: AsyncSession, entity_type: TaggableEntityType, entity_id: uuid.UUID
) -> tuple[uuid.UUID, str]:
    """Returns (owning_partner_role_id, title) for an advertisable entity, raising
    NotFoundError if it doesn't exist or isn't published — a draft/rejected listing
    can't be advertised."""
    if entity_type == TaggableEntityType.TOUR:
        result = await db.execute(
            select(Tour.local_expert_role_id, Tour.title).where(Tour.id == entity_id, Tour.status == TourStatus.PUBLISHED)
        )
    elif entity_type == TaggableEntityType.PROPERTY:
        result = await db.execute(
            select(Property.host_role_id, Property.name).where(
                Property.id == entity_id, Property.status == PropertyStatus.PUBLISHED
            )
        )
    elif entity_type == TaggableEntityType.VEHICLE:
        result = await db.execute(
            select(Vehicle.rent_a_car_role_id, Vehicle.make, Vehicle.model).where(
                Vehicle.id == entity_id, Vehicle.status == VehicleStatus.PUBLISHED
            )
        )
        row = result.first()
        if row is None:
            raise NotFoundError("Published vehicle not found")
        return row[0], f"{row[1]} {row[2]}"
    else:
        raise NotFoundError("Unsupported entity type")

    row = result.first()
    if row is None:
        raise NotFoundError("Published listing not found")
    return row[0], row[1]


async def _to_read(db: AsyncSession, campaign: AdCampaign) -> dict:
    _, title = await _resolve_entity(db, campaign.entity_type, campaign.entity_id)
    return {
        "id": campaign.id,
        "partner_role_id": campaign.partner_role_id,
        "entity_type": campaign.entity_type,
        "entity_id": campaign.entity_id,
        "entity_title": title,
        "placement_type": campaign.placement_type,
        "billing_model": campaign.billing_model,
        "bid_amount": campaign.bid_amount,
        "budget_total": campaign.budget_total,
        "budget_spent": campaign.budget_spent,
        "status": campaign.status,
        "rejection_reason": campaign.rejection_reason,
        "start_date": campaign.start_date,
        "end_date": campaign.end_date,
        "impressions_count": campaign.impressions_count,
        "clicks_count": campaign.clicks_count,
        "created_at": campaign.created_at,
        "updated_at": campaign.updated_at,
    }


async def get_campaign_read(db: AsyncSession, campaign: AdCampaign) -> AdCampaignRead:
    return AdCampaignRead(**await _to_read(db, campaign))


async def create_campaign(db: AsyncSession, role: PartnerRole, payload: AdCampaignCreate) -> AdCampaign:
    owner_role_id, _ = await _resolve_entity(db, payload.entity_type, payload.entity_id)
    if owner_role_id != role.id:
        raise NotFoundError("Published listing not found")  # hides existence of other partners' listings

    campaign = AdCampaign(
        partner_role_id=role.id,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        placement_type=payload.placement_type,
        billing_model=payload.billing_model,
        bid_amount=payload.bid_amount,
        budget_total=payload.budget_total,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def get_own_campaign_or_404(db: AsyncSession, role: PartnerRole, campaign_id: uuid.UUID) -> AdCampaign:
    result = await db.execute(
        select(AdCampaign).where(AdCampaign.id == campaign_id, AdCampaign.partner_role_id == role.id)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise NotFoundError("Campaign not found")
    return campaign


async def list_my_campaigns(db: AsyncSession, role: PartnerRole) -> list[AdCampaign]:
    result = await db.execute(
        select(AdCampaign).where(AdCampaign.partner_role_id == role.id).order_by(AdCampaign.created_at.desc())
    )
    return list(result.scalars().all())


async def update_campaign(
    db: AsyncSession, role: PartnerRole, campaign_id: uuid.UUID, payload: AdCampaignUpdate
) -> AdCampaign:
    campaign = await get_own_campaign_or_404(db, role, campaign_id)
    if campaign.status == AdCampaignStatus.COMPLETED:
        raise ConflictError("A completed campaign can no longer be edited")

    if payload.bid_amount is not None:
        campaign.bid_amount = payload.bid_amount
    if payload.budget_total is not None:
        if payload.budget_total < campaign.budget_spent:
            raise ConflictError("Budget can't be set below what's already been spent")
        campaign.budget_total = payload.budget_total
    if payload.start_date is not None:
        campaign.start_date = payload.start_date
    if payload.end_date is not None:
        campaign.end_date = payload.end_date

    await db.commit()
    await db.refresh(campaign)
    return campaign


async def set_campaign_locations(
    db: AsyncSession, role: PartnerRole, campaign_id: uuid.UUID, location_ids: list[uuid.UUID]
) -> list[LocationTag]:
    await get_own_campaign_or_404(db, role, campaign_id)
    return await locations_service.set_tags(db, TaggableEntityType.AD_CAMPAIGN, campaign_id, location_ids)


async def submit_for_review(db: AsyncSession, role: PartnerRole, campaign_id: uuid.UUID) -> AdCampaign:
    campaign = await get_own_campaign_or_404(db, role, campaign_id)
    if campaign.status not in (AdCampaignStatus.DRAFT, AdCampaignStatus.REJECTED):
        raise ConflictError(f"A {campaign.status.value} campaign can't be submitted for review")
    if not await locations_service.has_tags(db, TaggableEntityType.AD_CAMPAIGN, campaign_id):
        raise ConflictError("Tag at least one destination before submitting for review")

    campaign.status = AdCampaignStatus.PENDING_REVIEW
    campaign.rejection_reason = None
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def pause_campaign(db: AsyncSession, role: PartnerRole, campaign_id: uuid.UUID) -> AdCampaign:
    campaign = await get_own_campaign_or_404(db, role, campaign_id)
    if campaign.status != AdCampaignStatus.ACTIVE:
        raise ConflictError("Only an active campaign can be paused")
    campaign.status = AdCampaignStatus.PAUSED
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def resume_campaign(db: AsyncSession, role: PartnerRole, campaign_id: uuid.UUID) -> AdCampaign:
    campaign = await get_own_campaign_or_404(db, role, campaign_id)
    if campaign.status != AdCampaignStatus.PAUSED:
        raise ConflictError("Only a paused campaign can be resumed")
    if campaign.budget_spent >= campaign.budget_total:
        raise ConflictError("This campaign's budget is exhausted — increase the budget before resuming")
    campaign.status = AdCampaignStatus.ACTIVE
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def get_campaign_stats(db: AsyncSession, role: PartnerRole, campaign_id: uuid.UUID) -> AdCampaignStats:
    campaign = await get_own_campaign_or_404(db, role, campaign_id)
    ctr = campaign.clicks_count / campaign.impressions_count if campaign.impressions_count else 0.0
    return AdCampaignStats(
        impressions_count=campaign.impressions_count,
        clicks_count=campaign.clicks_count,
        click_through_rate=ctr,
        budget_total=campaign.budget_total,
        budget_spent=campaign.budget_spent,
        budget_remaining=campaign.budget_total - campaign.budget_spent,
    )


# --- public: sponsored placement serving + tracking ---


async def get_sponsored_results(
    db: AsyncSession,
    location_ids: list[uuid.UUID],
    entity_type: TaggableEntityType | None = None,
    limit: int = 3,
) -> list[SponsoredResult]:
    """Highest-bid-first auction over ACTIVE campaigns targeted at any of the given
    locations. Serving an impression here also records it (and, for CPM campaigns,
    accrues spend) — fetching this endpoint IS the impression, there's no separate
    client-side "mark as shown" call."""
    today = date.today()
    query = (
        select(AdCampaign)
        .join(
            LocationTag,
            (LocationTag.entity_id == AdCampaign.id) & (LocationTag.entity_type == TaggableEntityType.AD_CAMPAIGN),
        )
        .where(
            AdCampaign.status == AdCampaignStatus.ACTIVE,
            LocationTag.location_id.in_(location_ids),
            AdCampaign.budget_spent < AdCampaign.budget_total,
        )
    )
    if entity_type is not None:
        query = query.where(AdCampaign.entity_type == entity_type)

    result = await db.execute(query.distinct().order_by(AdCampaign.bid_amount.desc()).limit(limit))
    campaigns = list(result.scalars().all())

    results: list[SponsoredResult] = []
    for campaign in campaigns:
        # Skip campaigns outside their scheduled window rather than filtering in SQL —
        # the list is already small (limit=3) so this is cheap, and it keeps the date
        # comparisons (nullable start/end) out of the query.
        if campaign.start_date and campaign.start_date > today:
            continue
        if campaign.end_date and campaign.end_date < today:
            continue

        campaign.impressions_count += 1
        if campaign.billing_model == AdBillingModel.CPM:
            campaign.budget_spent += campaign.bid_amount / _MILLE
            if campaign.budget_spent >= campaign.budget_total:
                campaign.status = AdCampaignStatus.COMPLETED

        _, title = await _resolve_entity(db, campaign.entity_type, campaign.entity_id)
        results.append(
            SponsoredResult(
                campaign_id=campaign.id, entity_type=campaign.entity_type, entity_id=campaign.entity_id, entity_title=title
            )
        )

    await db.commit()
    return results


async def record_click(db: AsyncSession, campaign_id: uuid.UUID) -> AdCampaign:
    result = await db.execute(select(AdCampaign).where(AdCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise NotFoundError("Campaign not found")

    campaign.clicks_count += 1
    if campaign.billing_model == AdBillingModel.CPC:
        campaign.budget_spent += campaign.bid_amount
        if campaign.budget_spent >= campaign.budget_total:
            campaign.status = AdCampaignStatus.COMPLETED

    await db.commit()
    await db.refresh(campaign)
    return campaign


# --- admin ---


async def _to_admin_read(db: AsyncSession, campaign: AdCampaign) -> AdminAdCampaignRead:
    base = await _to_read(db, campaign)
    result = await db.execute(
        select(User.full_name, User.email, User.phone)
        .join(PartnerAccount, PartnerAccount.user_id == User.id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == campaign.partner_role_id)
    )
    row = result.first()
    applicant = AdApplicant(full_name=row[0], email=row[1], phone=row[2]) if row else AdApplicant(full_name="Unknown", email=None, phone=None)
    return AdminAdCampaignRead(**base, applicant=applicant)


async def list_admin_campaigns(db: AsyncSession, status: AdCampaignStatus | None) -> list[AdminAdCampaignRead]:
    query = select(AdCampaign)
    if status is not None:
        query = query.where(AdCampaign.status == status)
    result = await db.execute(query.order_by(AdCampaign.created_at.desc()))
    campaigns = list(result.scalars().all())
    return [await _to_admin_read(db, c) for c in campaigns]


async def _get_campaign_or_404(db: AsyncSession, campaign_id: uuid.UUID) -> AdCampaign:
    result = await db.execute(select(AdCampaign).where(AdCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise NotFoundError("Campaign not found")
    return campaign


async def approve_campaign(db: AsyncSession, admin: User, campaign_id: uuid.UUID) -> AdminAdCampaignRead:
    campaign = await _get_campaign_or_404(db, campaign_id)
    if campaign.status != AdCampaignStatus.PENDING_REVIEW:
        raise ConflictError("Only a pending-review campaign can be approved")
    campaign.status = AdCampaignStatus.ACTIVE
    await db.commit()
    await audit.record(db, actor_id=admin.id, action="ad_campaign.approve", entity_type="ad_campaign", entity_id=campaign.id)
    await db.refresh(campaign)
    return await _to_admin_read(db, campaign)


async def reject_campaign(db: AsyncSession, admin: User, campaign_id: uuid.UUID, reason: str) -> AdminAdCampaignRead:
    campaign = await _get_campaign_or_404(db, campaign_id)
    if campaign.status != AdCampaignStatus.PENDING_REVIEW:
        raise ConflictError("Only a pending-review campaign can be rejected")
    campaign.status = AdCampaignStatus.REJECTED
    campaign.rejection_reason = reason
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="ad_campaign.reject", entity_type="ad_campaign", entity_id=campaign.id, extra={"reason": reason}
    )
    await db.refresh(campaign)
    return await _to_admin_read(db, campaign)
