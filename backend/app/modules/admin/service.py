import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit, search_engine
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.admin.schemas import (
    AdminBookingRead,
    AdminPartnerRoleRead,
    AdminPaymentRead,
    AdminPropertyRead,
    AdminTourRead,
    AdminUserSummary,
    AdminVehicleRead,
)
from app.modules.bookings.models import Booking, BookingStatus
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.partners.models import (
    ApplicationStatus,
    DocumentStatus,
    PartnerDocument,
    PartnerRoleApplication,
)
from app.modules.payments.models import Payment, PaymentStatus
from app.modules.rentcar.models import Vehicle, VehicleStatus
from app.modules.stays.models import Property, PropertyStatus
from app.modules.tours.models import Tour, TourStatus
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, User


def _to_admin_read(role: PartnerRole) -> AdminPartnerRoleRead:
    return AdminPartnerRoleRead(
        id=role.id,
        role_type=role.role_type,
        status=role.status,
        approved_at=role.approved_at,
        created_at=role.created_at,
        documents=list(role.documents),
        applicant=AdminUserSummary.model_validate(role.partner_account.user),
    )


async def list_roles(db: AsyncSession, status: PartnerRoleStatus | None) -> list[AdminPartnerRoleRead]:
    query = select(PartnerRole).options(
        selectinload(PartnerRole.documents),
        selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user),
    )
    if status is not None:
        query = query.where(PartnerRole.status == status)
    result = await db.execute(query.order_by(PartnerRole.created_at.desc()))
    return [_to_admin_read(role) for role in result.scalars().all()]


async def _get_role_with_relations(db: AsyncSession, role_id: uuid.UUID) -> PartnerRole:
    result = await db.execute(
        select(PartnerRole)
        .where(PartnerRole.id == role_id)
        .options(
            selectinload(PartnerRole.documents),
            selectinload(PartnerRole.applications),
            selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user),
        )
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise NotFoundError("Partner role not found")
    return role


async def approve_role(db: AsyncSession, admin: User, role_id: uuid.UUID) -> AdminPartnerRoleRead:
    role = await _get_role_with_relations(db, role_id)
    if role.status != PartnerRoleStatus.PENDING:
        raise ConflictError(f"Role is {role.status.value}, not pending")

    role.status = PartnerRoleStatus.APPROVED
    role.approved_at = datetime.now(timezone.utc)

    latest_application = next(
        (a for a in role.applications if a.status == ApplicationStatus.PENDING), None
    )
    if latest_application:
        latest_application.status = ApplicationStatus.APPROVED
        latest_application.reviewed_by = admin.id
        latest_application.reviewed_at = datetime.now(timezone.utc)

    await notifications_service.notify(
        db,
        user_id=role.partner_account.user_id,
        type=NotificationType.ROLE_APPROVED,
        title="Partner role approved",
        message=f"Your {role.role_type.value.replace('_', ' ')} application has been approved.",
    )
    await db.commit()
    await audit.record(
        db,
        actor_id=admin.id,
        action="partner_role.approve",
        entity_type="partner_role",
        entity_id=role.id,
        extra={"role_type": role.role_type.value, "applicant_id": str(role.partner_account.user_id)},
    )
    return _to_admin_read(role)


async def reject_role(
    db: AsyncSession, admin: User, role_id: uuid.UUID, reason: str
) -> AdminPartnerRoleRead:
    role = await _get_role_with_relations(db, role_id)
    if role.status != PartnerRoleStatus.PENDING:
        raise ConflictError(f"Role is {role.status.value}, not pending")

    role.status = PartnerRoleStatus.REJECTED

    latest_application = next(
        (a for a in role.applications if a.status == ApplicationStatus.PENDING), None
    )
    if latest_application:
        latest_application.status = ApplicationStatus.REJECTED
        latest_application.reviewed_by = admin.id
        latest_application.reviewed_at = datetime.now(timezone.utc)
        latest_application.rejection_reason = reason

    await notifications_service.notify(
        db,
        user_id=role.partner_account.user_id,
        type=NotificationType.ROLE_REJECTED,
        title="Partner role application rejected",
        message=f"Your {role.role_type.value.replace('_', ' ')} application was rejected: {reason}",
    )
    await db.commit()
    await audit.record(
        db,
        actor_id=admin.id,
        action="partner_role.reject",
        entity_type="partner_role",
        entity_id=role.id,
        extra={"role_type": role.role_type.value, "reason": reason},
    )
    return _to_admin_read(role)


async def _get_document_or_404(db: AsyncSession, document_id: uuid.UUID) -> PartnerDocument:
    result = await db.execute(select(PartnerDocument).where(PartnerDocument.id == document_id))
    document = result.scalar_one_or_none()
    if document is None:
        raise NotFoundError("Document not found")
    return document


async def _get_document_owner_user_id(db: AsyncSession, partner_role_id: uuid.UUID) -> uuid.UUID:
    result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == partner_role_id)
    )
    return result.scalar_one()


async def verify_document(db: AsyncSession, admin: User, document_id: uuid.UUID) -> PartnerDocument:
    document = await _get_document_or_404(db, document_id)
    document.status = DocumentStatus.VERIFIED
    document.rejection_reason = None
    owner_user_id = await _get_document_owner_user_id(db, document.partner_role_id)
    await notifications_service.notify(
        db,
        user_id=owner_user_id,
        type=NotificationType.DOCUMENT_VERIFIED,
        title="Document verified",
        message=f"Your {document.document_type.value.replace('_', ' ')} document has been verified.",
    )
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="partner_document.verify", entity_type="partner_document", entity_id=document.id
    )
    await db.refresh(document)
    return document


async def reject_document(
    db: AsyncSession, admin: User, document_id: uuid.UUID, reason: str
) -> PartnerDocument:
    document = await _get_document_or_404(db, document_id)
    document.status = DocumentStatus.REJECTED
    document.rejection_reason = reason
    owner_user_id = await _get_document_owner_user_id(db, document.partner_role_id)
    await notifications_service.notify(
        db,
        user_id=owner_user_id,
        type=NotificationType.DOCUMENT_REJECTED,
        title="Document rejected",
        message=f"Your {document.document_type.value.replace('_', ' ')} document was rejected: {reason}",
    )
    await db.commit()
    await audit.record(
        db,
        actor_id=admin.id,
        action="partner_document.reject",
        entity_type="partner_document",
        entity_id=document.id,
        extra={"reason": reason},
    )
    await db.refresh(document)
    return document


def _to_admin_tour_read(tour: Tour) -> AdminTourRead:
    return AdminTourRead(
        id=tour.id,
        title=tour.title,
        slug=tour.slug,
        description=tour.description,
        duration_days=tour.duration_days,
        status=tour.status,
        rejection_reason=tour.rejection_reason,
        created_at=tour.created_at,
        applicant=AdminUserSummary.model_validate(tour.local_expert_role.partner_account.user),
    )


async def list_tours(db: AsyncSession, status: TourStatus | None) -> list[AdminTourRead]:
    query = select(Tour).options(
        selectinload(Tour.local_expert_role)
        .selectinload(PartnerRole.partner_account)
        .selectinload(PartnerAccount.user)
    )
    if status is not None:
        query = query.where(Tour.status == status)
    result = await db.execute(query.order_by(Tour.created_at.desc()))
    return [_to_admin_tour_read(tour) for tour in result.scalars().all()]


async def _get_tour_with_relations(db: AsyncSession, tour_id: uuid.UUID) -> Tour:
    result = await db.execute(
        select(Tour)
        .where(Tour.id == tour_id)
        .options(
            selectinload(Tour.local_expert_role)
            .selectinload(PartnerRole.partner_account)
            .selectinload(PartnerAccount.user)
        )
    )
    tour = result.scalar_one_or_none()
    if tour is None:
        raise NotFoundError("Tour not found")
    return tour


async def approve_tour(db: AsyncSession, admin: User, tour_id: uuid.UUID) -> AdminTourRead:
    tour = await _get_tour_with_relations(db, tour_id)
    if tour.status != TourStatus.PENDING_REVIEW:
        raise ConflictError(f"Tour is {tour.status.value}, not pending review")
    tour.status = TourStatus.PUBLISHED
    await notifications_service.notify(
        db,
        user_id=tour.local_expert_role.partner_account.user_id,
        type=NotificationType.LISTING_APPROVED,
        title="Tour approved",
        message=f'Your tour "{tour.title}" has been approved and is now published.',
        link=f"/tours/{tour.id}",
    )
    await db.commit()
    await search_engine.index_tour(tour.id, tour.title, tour.description, tour.base_price)
    await audit.record(db, actor_id=admin.id, action="tour.approve", entity_type="tour", entity_id=tour.id)
    return _to_admin_tour_read(tour)


async def reject_tour(db: AsyncSession, admin: User, tour_id: uuid.UUID, reason: str) -> AdminTourRead:
    tour = await _get_tour_with_relations(db, tour_id)
    if tour.status != TourStatus.PENDING_REVIEW:
        raise ConflictError(f"Tour is {tour.status.value}, not pending review")
    tour.status = TourStatus.REJECTED
    tour.rejection_reason = reason
    await notifications_service.notify(
        db,
        user_id=tour.local_expert_role.partner_account.user_id,
        type=NotificationType.LISTING_REJECTED,
        title="Tour rejected",
        message=f'Your tour "{tour.title}" was rejected: {reason}',
    )
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="tour.reject", entity_type="tour", entity_id=tour.id, extra={"reason": reason}
    )
    return _to_admin_tour_read(tour)


def _to_admin_property_read(prop: Property) -> AdminPropertyRead:
    return AdminPropertyRead(
        id=prop.id,
        name=prop.name,
        slug=prop.slug,
        description=prop.description,
        status=prop.status,
        rejection_reason=prop.rejection_reason,
        created_at=prop.created_at,
        applicant=AdminUserSummary.model_validate(prop.host_role.partner_account.user),
    )


async def list_properties(db: AsyncSession, status: PropertyStatus | None) -> list[AdminPropertyRead]:
    query = select(Property).options(
        selectinload(Property.host_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user)
    )
    if status is not None:
        query = query.where(Property.status == status)
    result = await db.execute(query.order_by(Property.created_at.desc()))
    return [_to_admin_property_read(prop) for prop in result.scalars().all()]


async def _get_property_with_relations(db: AsyncSession, property_id: uuid.UUID) -> Property:
    result = await db.execute(
        select(Property)
        .where(Property.id == property_id)
        .options(
            selectinload(Property.host_role)
            .selectinload(PartnerRole.partner_account)
            .selectinload(PartnerAccount.user)
        )
    )
    prop = result.scalar_one_or_none()
    if prop is None:
        raise NotFoundError("Property not found")
    return prop


async def approve_property(db: AsyncSession, admin: User, property_id: uuid.UUID) -> AdminPropertyRead:
    prop = await _get_property_with_relations(db, property_id)
    if prop.status != PropertyStatus.PENDING_REVIEW:
        raise ConflictError(f"Property is {prop.status.value}, not pending review")
    prop.status = PropertyStatus.PUBLISHED
    await notifications_service.notify(
        db,
        user_id=prop.host_role.partner_account.user_id,
        type=NotificationType.LISTING_APPROVED,
        title="Property approved",
        message=f'Your property "{prop.name}" has been approved and is now published.',
        link=f"/stays/{prop.id}",
    )
    await db.commit()
    await search_engine.index_property(prop.id, prop.name, prop.description, prop.property_type.value)
    await audit.record(db, actor_id=admin.id, action="property.approve", entity_type="property", entity_id=prop.id)
    return _to_admin_property_read(prop)


async def reject_property(db: AsyncSession, admin: User, property_id: uuid.UUID, reason: str) -> AdminPropertyRead:
    prop = await _get_property_with_relations(db, property_id)
    if prop.status != PropertyStatus.PENDING_REVIEW:
        raise ConflictError(f"Property is {prop.status.value}, not pending review")
    prop.status = PropertyStatus.REJECTED
    prop.rejection_reason = reason
    await notifications_service.notify(
        db,
        user_id=prop.host_role.partner_account.user_id,
        type=NotificationType.LISTING_REJECTED,
        title="Property rejected",
        message=f'Your property "{prop.name}" was rejected: {reason}',
    )
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="property.reject", entity_type="property", entity_id=prop.id, extra={"reason": reason}
    )
    return _to_admin_property_read(prop)


def _to_admin_booking_read(booking: Booking) -> AdminBookingRead:
    return AdminBookingRead(
        id=booking.id,
        status=booking.status,
        total_amount=booking.total_amount,
        currency=booking.currency,
        created_at=booking.created_at,
        traveler=AdminUserSummary.model_validate(booking.user),
        item_count=len(booking.items),
    )


async def list_bookings(db: AsyncSession, status: BookingStatus | None) -> list[AdminBookingRead]:
    query = select(Booking).options(selectinload(Booking.user), selectinload(Booking.items))
    if status is not None:
        query = query.where(Booking.status == status)
    result = await db.execute(query.order_by(Booking.created_at.desc()).limit(200))
    return [_to_admin_booking_read(booking) for booking in result.scalars().all()]


async def list_payments(db: AsyncSession, status: PaymentStatus | None) -> list[Payment]:
    query = select(Payment)
    if status is not None:
        query = query.where(Payment.status == status)
    result = await db.execute(query.order_by(Payment.created_at.desc()).limit(200))
    return list(result.scalars().all())


def _to_admin_vehicle_read(vehicle: Vehicle) -> AdminVehicleRead:
    return AdminVehicleRead(
        id=vehicle.id,
        make=vehicle.make,
        model=vehicle.model,
        year=vehicle.year,
        status=vehicle.status,
        rejection_reason=vehicle.rejection_reason,
        created_at=vehicle.created_at,
        applicant=AdminUserSummary.model_validate(vehicle.rent_a_car_role.partner_account.user),
    )


async def list_vehicles(db: AsyncSession, status: VehicleStatus | None) -> list[AdminVehicleRead]:
    query = select(Vehicle).options(
        selectinload(Vehicle.rent_a_car_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user)
    )
    if status is not None:
        query = query.where(Vehicle.status == status)
    result = await db.execute(query.order_by(Vehicle.created_at.desc()))
    return [_to_admin_vehicle_read(v) for v in result.scalars().all()]


async def _get_vehicle_with_relations(db: AsyncSession, vehicle_id: uuid.UUID) -> Vehicle:
    result = await db.execute(
        select(Vehicle)
        .where(Vehicle.id == vehicle_id)
        .options(
            selectinload(Vehicle.rent_a_car_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user)
        )
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise NotFoundError("Vehicle not found")
    return vehicle


async def approve_vehicle(db: AsyncSession, admin: User, vehicle_id: uuid.UUID) -> AdminVehicleRead:
    vehicle = await _get_vehicle_with_relations(db, vehicle_id)
    if vehicle.status != VehicleStatus.PENDING_REVIEW:
        raise ConflictError(f"Vehicle is {vehicle.status.value}, not pending review")
    vehicle.status = VehicleStatus.PUBLISHED
    await notifications_service.notify(
        db,
        user_id=vehicle.rent_a_car_role.partner_account.user_id,
        type=NotificationType.LISTING_APPROVED,
        title="Vehicle approved",
        message=f"Your {vehicle.make} {vehicle.model} has been approved and is now published.",
        link=f"/rent-a-car/{vehicle.id}",
    )
    await db.commit()
    await search_engine.index_vehicle(vehicle.id, vehicle.make, vehicle.model, vehicle.description, vehicle.vehicle_type.value)
    await audit.record(db, actor_id=admin.id, action="vehicle.approve", entity_type="vehicle", entity_id=vehicle.id)
    return _to_admin_vehicle_read(vehicle)


async def reject_vehicle(db: AsyncSession, admin: User, vehicle_id: uuid.UUID, reason: str) -> AdminVehicleRead:
    vehicle = await _get_vehicle_with_relations(db, vehicle_id)
    if vehicle.status != VehicleStatus.PENDING_REVIEW:
        raise ConflictError(f"Vehicle is {vehicle.status.value}, not pending review")
    vehicle.status = VehicleStatus.REJECTED
    vehicle.rejection_reason = reason
    await notifications_service.notify(
        db,
        user_id=vehicle.rent_a_car_role.partner_account.user_id,
        type=NotificationType.LISTING_REJECTED,
        title="Vehicle rejected",
        message=f"Your {vehicle.make} {vehicle.model} was rejected: {reason}",
    )
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="vehicle.reject", entity_type="vehicle", entity_id=vehicle.id, extra={"reason": reason}
    )
    return _to_admin_vehicle_read(vehicle)
