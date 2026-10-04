"""See models.py for the overall design and rules."""
import calendar
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core import audit
from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.modules.commissions.models import Commission, CommissionSource, CommissionStatus
from app.modules.guides.models import GuideSupervision, SupervisionStatus
from app.modules.locations.models import Location
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.profiles.models import LocalExpertProfile
from app.modules.referrals.models import AttributionSource, AttributionStatus, ExpertReferralLink, NetworkAttribution
from app.modules.referrals.schemas import (
    AdminAttributionRead,
    AttributionTermsUpdate,
    NetworkMemberRead,
    PublicReferralLinkRead,
    ReferralLinkRead,
    ReferralLinkStats,
)
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, PartnerRoleType, User

settings = get_settings()

# Crockford-style alphabet minus 0/O/1/I/L/U: readable aloud and over a phone call
# without ambiguity. 30^8 ≈ 6.6e11 codes — not guessable by enumeration at the
# public lookup endpoint's rate limit.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LENGTH = 8

# PRD §12.1/§13.1: who a Local Expert can bring into their network. LOCAL_EXPERT is
# deliberately absent — the network is one level deep (see models.py).
JOINABLE_ROLE_TYPES = (PartnerRoleType.GUIDE, PartnerRoleType.HOST, PartnerRoleType.HOTEL, PartnerRoleType.RENT_A_CAR)

EXPIRING_SOON_DAYS = 30

_ATTRIBUTION_EAGER = (
    selectinload(NetworkAttribution.referring_expert_role)
    .selectinload(PartnerRole.partner_account)
    .selectinload(PartnerAccount.user),
    selectinload(NetworkAttribution.referred_user),
    selectinload(NetworkAttribution.referred_partner_role),
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(code: str | None) -> str | None:
    if code is None:
        return None
    cleaned = code.strip().upper().replace("-", "").replace(" ", "")
    return cleaned or None


def add_months(dt: datetime, months: int) -> datetime:
    """Calendar-month arithmetic, clamping the day (31 Jan + 1 month = 28/29 Feb)."""
    index = dt.month - 1 + months
    year, month = dt.year + index // 12, index % 12 + 1
    return dt.replace(year=year, month=month, day=min(dt.day, calendar.monthrange(year, month)[1]))


def commission_window(starts_at: datetime) -> tuple[datetime, datetime]:
    return starts_at, add_months(starts_at, settings.network_attribution_months)


def effective_status(attribution: NetworkAttribution, now: datetime | None = None) -> str:
    now = now or _now()
    if (
        attribution.status == AttributionStatus.ACTIVE
        and attribution.commission_expires_at is not None
        and attribution.commission_expires_at <= now
    ):
        return "expired"
    return attribution.status.value


def is_earning(attribution: NetworkAttribution, at: datetime) -> bool:
    """Pure check of the attribution's own state and window — the commission engine
    layers the booker/expert-status checks on top (commissions/service.py)."""
    if attribution.status != AttributionStatus.ACTIVE or attribution.commission_starts_at is None:
        return False
    if at < attribution.commission_starts_at:
        return False
    if attribution.commission_expires_at is not None and at >= attribution.commission_expires_at:
        return False
    return True


def role_url(code: str, role_type: PartnerRoleType | None = None) -> str:
    base = f"{settings.frontend_url.rstrip('/')}/join/{code}"
    return f"{base}?role={role_type.value}" if role_type else base


async def _user_id_for_role(db: AsyncSession, role_id: uuid.UUID) -> uuid.UUID | None:
    result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == role_id)
    )
    return result.scalar_one_or_none()


# --- The expert's own link ---


async def _active_link_for_expert(db: AsyncSession, expert_role_id: uuid.UUID) -> ExpertReferralLink | None:
    result = await db.execute(
        select(ExpertReferralLink).where(
            ExpertReferralLink.expert_role_id == expert_role_id, ExpertReferralLink.is_active.is_(True)
        )
    )
    return result.scalar_one_or_none()


async def _new_unique_code(db: AsyncSession) -> str:
    for _ in range(10):
        code = generate_code()
        exists = await db.execute(select(ExpertReferralLink.id).where(ExpertReferralLink.code == code))
        if exists.scalar_one_or_none() is None:
            return code
    raise AppError("Could not generate a unique referral code — try again")


async def get_or_create_link(db: AsyncSession, expert_role: PartnerRole) -> ExpertReferralLink:
    link = await _active_link_for_expert(db, expert_role.id)
    if link is None:
        link = ExpertReferralLink(expert_role_id=expert_role.id, code=await _new_unique_code(db))
        db.add(link)
        await db.commit()
        await db.refresh(link)
    return link


async def regenerate_link(db: AsyncSession, expert_role: PartnerRole) -> ExpertReferralLink:
    """Deactivates the current code (anyone who already joined through it keeps their
    attribution — only *new* signups through the old code stop working)."""
    old = await _active_link_for_expert(db, expert_role.id)
    if old is not None:
        old.is_active = False
        old.deactivated_at = _now()
        await db.flush()
    link = ExpertReferralLink(expert_role_id=expert_role.id, code=await _new_unique_code(db))
    db.add(link)
    await db.commit()
    await db.refresh(link)
    await audit.record(
        db,
        actor_id=await _user_id_for_role(db, expert_role.id),
        action="referral_link.regenerate",
        entity_type="expert_referral_link",
        entity_id=link.id,
    )
    return link


async def _earnings_by_attribution(
    db: AsyncSession, attribution_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, Decimal | int]]:
    if not attribution_ids:
        return {}
    result = await db.execute(
        select(
            Commission.attribution_id,
            func.coalesce(
                func.sum(case((Commission.status.in_([CommissionStatus.PENDING, CommissionStatus.ON_HOLD]), Commission.partner_net_amount))), 0
            ),
            func.coalesce(func.sum(case((Commission.status == CommissionStatus.PAYABLE, Commission.partner_net_amount))), 0),
            func.coalesce(func.sum(case((Commission.status == CommissionStatus.PAID, Commission.partner_net_amount))), 0),
            func.count(case((Commission.status.in_([CommissionStatus.PAYABLE, CommissionStatus.PAID]), Commission.id))),
        )
        .where(Commission.attribution_id.in_(attribution_ids), Commission.source == CommissionSource.NETWORK)
        .group_by(Commission.attribution_id)
    )
    return {
        row[0]: {"pending": Decimal(row[1]), "payable": Decimal(row[2]), "paid": Decimal(row[3]), "completed": int(row[4])}
        for row in result.all()
    }


async def get_my_link(db: AsyncSession, expert_role: PartnerRole) -> ReferralLinkRead:
    link = await get_or_create_link(db, expert_role)

    visits = await db.execute(
        select(func.coalesce(func.sum(ExpertReferralLink.visit_count), 0)).where(
            ExpertReferralLink.expert_role_id == expert_role.id
        )
    )
    attributions = (
        await db.execute(select(NetworkAttribution).where(NetworkAttribution.referring_expert_role_id == expert_role.id))
    ).scalars().all()

    now = _now()
    soon = now + timedelta(days=EXPIRING_SOON_DAYS)
    counts = {"pending": 0, "active": 0, "expired": 0}
    expiring_soon = 0
    for a in attributions:
        status = effective_status(a, now)
        if status in counts:
            counts[status] += 1
        if status == "active" and a.commission_expires_at is not None and a.commission_expires_at <= soon:
            expiring_soon += 1

    earnings = await _earnings_by_attribution(db, [a.id for a in attributions])
    stats = ReferralLinkStats(
        visits=int(visits.scalar_one()),
        signups=sum(1 for a in attributions if a.source == AttributionSource.REFERRAL_LINK),
        pending=counts["pending"],
        active=counts["active"],
        expired=counts["expired"],
        expiring_soon=expiring_soon,
        network_earnings_pending=sum((e["pending"] for e in earnings.values()), Decimal("0")),
        network_earnings_payable=sum((e["payable"] for e in earnings.values()), Decimal("0")),
        network_earnings_paid=sum((e["paid"] for e in earnings.values()), Decimal("0")),
    )
    return ReferralLinkRead(
        code=link.code,
        url=role_url(link.code),
        role_urls={rt.value: role_url(link.code, rt) for rt in JOINABLE_ROLE_TYPES},
        created_at=link.created_at,
        attribution_months=settings.network_attribution_months,
        stats=stats,
    )


async def list_my_members(
    db: AsyncSession,
    expert_role: PartnerRole,
    status: str | None = None,
    role_type: PartnerRoleType | None = None,
) -> list[NetworkMemberRead]:
    query = (
        select(NetworkAttribution)
        .where(NetworkAttribution.referring_expert_role_id == expert_role.id)
        .options(*_ATTRIBUTION_EAGER)
        .order_by(NetworkAttribution.created_at.desc())
    )
    if role_type is not None:
        query = query.where(NetworkAttribution.role_type == role_type)
    attributions = list((await db.execute(query)).scalars().all())
    earnings = await _earnings_by_attribution(db, [a.id for a in attributions])

    now = _now()
    members = []
    for a in attributions:
        eff = effective_status(a, now)
        if status is not None and eff != status:
            continue
        e = earnings.get(a.id, {})
        members.append(
            NetworkMemberRead(
                id=a.id,
                member_name=a.referred_user.full_name,
                role_type=a.role_type,
                source=a.source,
                status=eff,
                role_approved=a.referred_partner_role.status == PartnerRoleStatus.APPROVED,
                commission_starts_at=a.commission_starts_at,
                commission_expires_at=a.commission_expires_at,
                custom_commission_rate=a.custom_commission_rate,
                joined_at=a.created_at,
                completed_bookings=int(e.get("completed", 0)),
                earnings_pending=e.get("pending", Decimal("0")),
                earnings_payable=e.get("payable", Decimal("0")),
                earnings_paid=e.get("paid", Decimal("0")),
            )
        )
    return members


# --- Public lookup ---


async def resolve_active_link(db: AsyncSession, code: str | None) -> ExpertReferralLink | None:
    """An active link whose expert still holds an APPROVED Local Expert role, or None."""
    code = normalize_code(code)
    if not code:
        return None
    result = await db.execute(
        select(ExpertReferralLink)
        .join(PartnerRole, PartnerRole.id == ExpertReferralLink.expert_role_id)
        .where(
            ExpertReferralLink.code == code,
            ExpertReferralLink.is_active.is_(True),
            PartnerRole.role_type == PartnerRoleType.LOCAL_EXPERT,
            PartnerRole.status == PartnerRoleStatus.APPROVED,
        )
        .options(
            selectinload(ExpertReferralLink.expert_role)
            .selectinload(PartnerRole.partner_account)
            .selectinload(PartnerAccount.user)
        )
    )
    return result.scalar_one_or_none()


async def _public_info(db: AsyncSession, link: ExpertReferralLink) -> PublicReferralLinkRead:
    role = link.expert_role
    profile = (
        await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
    ).scalar_one_or_none()
    destination = None
    if profile is not None and profile.primary_destination_id:
        destination = (
            await db.execute(select(Location.name).where(Location.id == profile.primary_destination_id))
        ).scalar_one_or_none()
    photo_url = (
        f"/api/v1/partners/profiles/expert/{role.id}/photo/file"
        if profile is not None and profile.is_published and profile.has_photo
        else None
    )
    return PublicReferralLinkRead(
        code=link.code,
        expert_role_id=role.id,
        expert_name=role.partner_account.user.full_name,
        headline=profile.headline if profile is not None else None,
        photo_url=photo_url,
        primary_destination=destination,
        years_experience=profile.years_experience if profile is not None else None,
        allowed_role_types=list(JOINABLE_ROLE_TYPES),
    )


async def get_public_link(db: AsyncSession, code: str) -> PublicReferralLinkRead:
    link = await resolve_active_link(db, code)
    if link is None:
        raise NotFoundError("This referral link is no longer active")
    # Best-effort counter (same aggregate-counter approach as ads impressions/clicks) —
    # an atomic UPDATE so concurrent visits don't lose increments.
    await db.execute(
        update(ExpertReferralLink)
        .where(ExpertReferralLink.id == link.id)
        .values(visit_count=ExpertReferralLink.visit_count + 1)
    )
    await db.commit()
    return await _public_info(db, link)


# --- Registration and partner application hooks ---


async def record_signup_link(db: AsyncSession, user: User, code: str | None) -> None:
    """Called during registration, before the user row is committed. An invalid or
    inactive code is ignored rather than failing signup over a typo."""
    link = await resolve_active_link(db, code)
    if link is not None and link.expert_role.partner_account.user_id != user.id:
        user.signup_referral_link_id = link.id


async def _signup_link_fallback(db: AsyncSession, user: User) -> ExpertReferralLink | None:
    """The link the user registered through, while it still counts as how they came
    to Ovigo (within the attribution window of registering)."""
    if user.signup_referral_link_id is None:
        return None
    if user.created_at is not None and user.created_at < add_months(_now(), -settings.network_attribution_months):
        return None
    result = await db.execute(select(ExpertReferralLink.code).where(ExpertReferralLink.id == user.signup_referral_link_id))
    return await resolve_active_link(db, result.scalar_one_or_none())


async def get_my_invite(db: AsyncSession, user: User) -> PublicReferralLinkRead | None:
    """Lets the partner-application page show "joining X's network" (and the terms
    checkbox) for a user who registered through a link, even if the browser lost
    the code it stored at the time."""
    link = await _signup_link_fallback(db, user)
    return await _public_info(db, link) if link is not None else None


async def _reciprocal_exists(db: AsyncSession, referrer_user_id: uuid.UUID, referred_user_id: uuid.UUID) -> bool:
    """Is the would-be referred user already a referrer of any role held by the
    would-be referrer? (A refers B's homestay while B refers A's homestay.)"""
    result = await db.execute(
        select(NetworkAttribution.id)
        .join(PartnerRole, PartnerRole.id == NetworkAttribution.referring_expert_role_id)
        .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
        .where(PartnerAccount.user_id == referred_user_id, NetworkAttribution.referred_user_id == referrer_user_id)
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def validate_for_application(
    db: AsyncSession,
    user: User,
    role_type: PartnerRoleType,
    referral_code: str | None,
    accept_terms: bool,
) -> tuple[ExpertReferralLink | None, bool]:
    """Resolves which link (if any) a partner-role application is attributed to,
    *before* anything is written, so a rejected code never leaves a half-created
    role behind. Returns (link, terms_accepted).

    An explicitly supplied code is strict — any reason it can't apply is a 409 the
    applicant sees. The signup-link fallback is lenient — if it can't apply, the
    application simply proceeds unattributed.
    """
    explicit = normalize_code(referral_code) is not None
    link = await resolve_active_link(db, referral_code) if explicit else await _signup_link_fallback(db, user)

    if explicit and link is None:
        raise ConflictError("This referral link is no longer active — remove it to apply without one")
    if link is None:
        return None, False

    def reject(message: str):
        if explicit:
            raise ConflictError(message)
        return None, False

    if role_type not in JOINABLE_ROLE_TYPES:
        return reject("Local Experts can't join through another expert's referral link")
    referrer_user_id = link.expert_role.partner_account.user_id
    if referrer_user_id == user.id:
        return reject("You can't join your own network")
    if await _reciprocal_exists(db, referrer_user_id, user.id):
        return reject("You already refer this expert's business — reciprocal referrals aren't allowed")
    if explicit and not accept_terms:
        raise ConflictError("Accept the network terms to join through this referral link")
    return link, accept_terms


async def attach_to_application(
    db: AsyncSession, user: User, role: PartnerRole, link: ExpertReferralLink | None, terms_accepted: bool
) -> None:
    """Called inside apply_for_role's transaction, after the role row exists and
    before its commit. First touch wins: a role that already has an attribution
    (e.g. re-applying after a rejection) keeps its original referrer."""
    existing = (
        await db.execute(select(NetworkAttribution).where(NetworkAttribution.referred_partner_role_id == role.id))
    ).scalar_one_or_none()
    if existing is not None:
        if existing.status == AttributionStatus.REJECTED:
            existing.status = AttributionStatus.PENDING
        return
    if link is None:
        return

    attribution = NetworkAttribution(
        referring_expert_role_id=link.expert_role_id,
        referred_user_id=user.id,
        referred_partner_role_id=role.id,
        role_type=role.role_type,
        source=AttributionSource.REFERRAL_LINK,
        referral_link_id=link.id,
        status=AttributionStatus.PENDING,
        terms_accepted_at=_now() if terms_accepted else None,
        terms_version=settings.network_terms_version if terms_accepted else None,
    )
    db.add(attribution)

    if role.role_type == PartnerRoleType.GUIDE:
        await _supervise_joined_guide(db, link.expert_role_id, role.id)

    role_label = role.role_type.value.replace("_", " ")
    await notifications_service.notify(
        db,
        user_id=link.expert_role.partner_account.user_id,
        type=NotificationType.NETWORK_MEMBER_JOINED,
        title="New member joined your network",
        message=f"{user.full_name} applied to join Ovigo as a {role_label} through your referral link. "
        "You'll start earning once Ovigo approves them.",
        link="/dashboard/network",
    )


async def _supervise_joined_guide(db: AsyncSession, expert_role_id: uuid.UUID, guide_role_id: uuid.UUID) -> None:
    """A guide who chose this expert's link has already consented to the
    relationship, so supervision starts ACCEPTED (the guide role itself still waits
    for admin approval). guide_supervision is unique per guide_role_id regardless of
    status, so an old ended/declined row is re-pointed rather than duplicated; an
    existing live supervision is left alone."""
    existing = (
        await db.execute(select(GuideSupervision).where(GuideSupervision.guide_role_id == guide_role_id))
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            GuideSupervision(
                local_expert_role_id=expert_role_id,
                guide_role_id=guide_role_id,
                status=SupervisionStatus.ACCEPTED,
                responded_at=_now(),
            )
        )
    elif existing.status in (SupervisionStatus.REJECTED, SupervisionStatus.TERMINATED):
        existing.local_expert_role_id = expert_role_id
        existing.status = SupervisionStatus.ACCEPTED
        existing.responded_at = _now()


async def activate_for_role(db: AsyncSession, role: PartnerRole) -> None:
    """Called inside approve_role's transaction: the referred role is now approved,
    so its attribution starts earning, for the configured window from today."""
    attribution = (
        await db.execute(
            select(NetworkAttribution)
            .where(
                NetworkAttribution.referred_partner_role_id == role.id,
                NetworkAttribution.status == AttributionStatus.PENDING,
            )
            .options(*_ATTRIBUTION_EAGER)
        )
    ).scalar_one_or_none()
    if attribution is None:
        return
    starts, expires = commission_window(role.approved_at or _now())
    attribution.status = AttributionStatus.ACTIVE
    attribution.commission_starts_at = starts
    attribution.commission_expires_at = expires

    role_label = role.role_type.value.replace("_", " ")
    await notifications_service.notify(
        db,
        user_id=attribution.referring_expert_role.partner_account.user_id,
        type=NotificationType.NETWORK_MEMBER_ACTIVATED,
        title="Network member approved",
        message=f"{attribution.referred_user.full_name} is now an approved {role_label}. "
        f"You earn a network commission on their completed bookings until {expires:%d %b %Y}.",
        link="/dashboard/network",
    )


async def reject_for_role(db: AsyncSession, role: PartnerRole) -> None:
    await db.execute(
        update(NetworkAttribution)
        .where(
            NetworkAttribution.referred_partner_role_id == role.id,
            NetworkAttribution.status == AttributionStatus.PENDING,
        )
        .values(status=AttributionStatus.REJECTED)
    )


async def upsert_for_business_referral(db: AsyncSession, referral) -> None:
    """business_network/service.py's link_partner: an approved business referral is
    now tied to a real partner role. Writes the attribution the commission engine
    reads. Raises if that partner was already brought in by someone else (first
    touch wins)."""
    partner_role = (
        await db.execute(select(PartnerRole).where(PartnerRole.id == referral.linked_partner_role_id))
    ).scalar_one_or_none()
    if partner_role is None:
        raise NotFoundError("Partner role not found")
    if partner_role.role_type == PartnerRoleType.LOCAL_EXPERT:
        raise ConflictError("A Local Expert role can't be part of another expert's network")
    referred_user_id = await _user_id_for_role(db, partner_role.id)
    if referred_user_id == await _user_id_for_role(db, referral.referring_expert_role_id):
        raise ConflictError("That partner role belongs to the referring expert — self-referrals don't earn a network commission")

    existing = (
        await db.execute(
            select(NetworkAttribution).where(NetworkAttribution.referred_partner_role_id == partner_role.id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.referring_expert_role_id != referral.referring_expert_role_id:
            raise ConflictError("This partner is already attributed to another expert's network")
        existing.business_referral_id = referral.id
        if referral.custom_commission_rate is not None:
            existing.custom_commission_rate = referral.custom_commission_rate
        return

    attribution = NetworkAttribution(
        referring_expert_role_id=referral.referring_expert_role_id,
        referred_user_id=referred_user_id,
        referred_partner_role_id=partner_role.id,
        role_type=partner_role.role_type,
        source=AttributionSource.BUSINESS_REFERRAL,
        business_referral_id=referral.id,
        custom_commission_rate=referral.custom_commission_rate,
        status=AttributionStatus.PENDING,
    )
    if partner_role.status == PartnerRoleStatus.APPROVED:
        attribution.status = AttributionStatus.ACTIVE
        attribution.commission_starts_at, attribution.commission_expires_at = commission_window(_now())
    db.add(attribution)


async def sync_business_referral_rate(db: AsyncSession, referral) -> None:
    """business_network's set_commission_rate keeps its own column for the admin UI;
    mirror it onto the attribution the engine actually reads."""
    await db.execute(
        update(NetworkAttribution)
        .where(NetworkAttribution.business_referral_id == referral.id)
        .values(custom_commission_rate=referral.custom_commission_rate)
    )


# --- Admin ---


async def _get_attribution_or_404(db: AsyncSession, attribution_id: uuid.UUID) -> NetworkAttribution:
    result = await db.execute(
        select(NetworkAttribution).where(NetworkAttribution.id == attribution_id).options(*_ATTRIBUTION_EAGER)
    )
    attribution = result.scalar_one_or_none()
    if attribution is None:
        raise NotFoundError("Network attribution not found")
    return attribution


def _to_admin_read(a: NetworkAttribution, total: Decimal) -> AdminAttributionRead:
    return AdminAttributionRead(
        id=a.id,
        referring_expert_role_id=a.referring_expert_role_id,
        referring_expert_name=a.referring_expert_role.partner_account.user.full_name,
        referred_user_id=a.referred_user_id,
        referred_partner_role_id=a.referred_partner_role_id,
        member_name=a.referred_user.full_name,
        role_type=a.role_type,
        source=a.source,
        stored_status=a.status,
        status=effective_status(a),
        custom_commission_rate=a.custom_commission_rate,
        commission_starts_at=a.commission_starts_at,
        commission_expires_at=a.commission_expires_at,
        terms_accepted_at=a.terms_accepted_at,
        revoked_reason=a.revoked_reason,
        created_at=a.created_at,
        total_network_commission=total,
    )


async def _admin_read(db: AsyncSession, attribution_id: uuid.UUID) -> AdminAttributionRead:
    a = await _get_attribution_or_404(db, attribution_id)
    e = (await _earnings_by_attribution(db, [a.id])).get(a.id, {})
    total = e.get("pending", Decimal("0")) + e.get("payable", Decimal("0")) + e.get("paid", Decimal("0"))
    return _to_admin_read(a, total)


async def admin_list(
    db: AsyncSession,
    status: str | None = None,
    expert_role_id: uuid.UUID | None = None,
    role_type: PartnerRoleType | None = None,
) -> list[AdminAttributionRead]:
    query = select(NetworkAttribution).options(*_ATTRIBUTION_EAGER).order_by(NetworkAttribution.created_at.desc())
    if expert_role_id is not None:
        query = query.where(NetworkAttribution.referring_expert_role_id == expert_role_id)
    if role_type is not None:
        query = query.where(NetworkAttribution.role_type == role_type)
    attributions = list((await db.execute(query)).scalars().all())
    earnings = await _earnings_by_attribution(db, [a.id for a in attributions])
    rows = []
    for a in attributions:
        if status is not None and effective_status(a) != status:
            continue
        e = earnings.get(a.id, {})
        total = e.get("pending", Decimal("0")) + e.get("payable", Decimal("0")) + e.get("paid", Decimal("0"))
        rows.append(_to_admin_read(a, total))
    return rows


async def admin_revoke(db: AsyncSession, admin: User, attribution_id: uuid.UUID, reason: str) -> AdminAttributionRead:
    """Stops future earning and cancels this attribution's not-yet-paid NETWORK rows
    (revocation is the fraud lever — a PAID row is already money out the door and is
    left for the payouts module's own reversal flow)."""
    a = await _get_attribution_or_404(db, attribution_id)
    if a.status == AttributionStatus.REVOKED:
        raise ConflictError("Attribution is already revoked")
    a.status = AttributionStatus.REVOKED
    a.revoked_reason = reason
    await db.execute(
        update(Commission)
        .where(
            Commission.attribution_id == a.id,
            Commission.status.in_([CommissionStatus.PENDING, CommissionStatus.PAYABLE, CommissionStatus.ON_HOLD]),
            Commission.payout_id.is_(None),
        )
        .values(status=CommissionStatus.CANCELLED)
    )
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="network_attribution.revoke", entity_type="network_attribution",
        entity_id=a.id, extra={"reason": reason},
    )
    return await _admin_read(db, attribution_id)


async def admin_reassign(
    db: AsyncSession, admin: User, attribution_id: uuid.UUID, expert_role_id: uuid.UUID, reason: str
) -> AdminAttributionRead:
    """Future bookings credit the new expert; NETWORK rows already written stay with
    whoever they were written for."""
    a = await _get_attribution_or_404(db, attribution_id)
    new_role = (
        await db.execute(
            select(PartnerRole).where(
                PartnerRole.id == expert_role_id,
                PartnerRole.role_type == PartnerRoleType.LOCAL_EXPERT,
                PartnerRole.status == PartnerRoleStatus.APPROVED,
            )
        )
    ).scalar_one_or_none()
    if new_role is None:
        raise ConflictError("Reassign target must be an approved Local Expert role")
    new_user_id = await _user_id_for_role(db, new_role.id)
    if new_user_id == a.referred_user_id:
        raise ConflictError("A partner can't be attributed to their own expert role")
    previous = a.referring_expert_role_id
    a.referring_expert_role_id = new_role.id
    a.source = AttributionSource.ADMIN
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="network_attribution.reassign", entity_type="network_attribution",
        entity_id=a.id, extra={"from": str(previous), "to": str(new_role.id), "reason": reason},
    )
    return await _admin_read(db, attribution_id)


async def admin_update_terms(
    db: AsyncSession, admin: User, attribution_id: uuid.UUID, payload: AttributionTermsUpdate
) -> AdminAttributionRead:
    a = await _get_attribution_or_404(db, attribution_id)
    if payload.clear_custom_rate:
        a.custom_commission_rate = None
    elif payload.custom_commission_rate is not None:
        a.custom_commission_rate = payload.custom_commission_rate
    if payload.commission_expires_at is not None:
        if a.commission_starts_at is not None and payload.commission_expires_at <= a.commission_starts_at:
            raise ConflictError("Expiry must be after the commission start date")
        a.commission_expires_at = payload.commission_expires_at
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="network_attribution.update_terms", entity_type="network_attribution",
        entity_id=a.id,
        extra={
            "custom_commission_rate": str(a.custom_commission_rate) if a.custom_commission_rate is not None else None,
            "commission_expires_at": a.commission_expires_at.isoformat() if a.commission_expires_at else None,
        },
    )
    return await _admin_read(db, attribution_id)
