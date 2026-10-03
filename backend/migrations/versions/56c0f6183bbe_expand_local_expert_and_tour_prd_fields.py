"""expand_local_expert_and_tour_prd_fields

Revision ID: 56c0f6183bbe
Revises: a8f3c1d9e442
Create Date: 2026-10-03 22:03:13.696339

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '56c0f6183bbe'
down_revision: Union[str, None] = 'a8f3c1d9e442'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate doesn't detect new values on an existing native enum, and adding
    # them must run outside the migration's normal transaction block (established
    # pattern in this codebase — see e.g. 5a3f9e1c7b28's fraud_rule_type expansion).
    with op.get_context().autocommit_block():
        # 1. Expand tour_status enum with PRD 10.4 statuses
        for val in [
            'SUBMITTED_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED',
            'BOOKING_OPEN', 'ALMOST_FULL', 'SOLD_OUT', 'CONFIRMED', 'IN_PROGRESS',
            'COMPLETED', 'CANCELLED', 'SUSPENDED', 'ARCHIVED'
        ]:
            op.execute(f"ALTER TYPE tour_status ADD VALUE IF NOT EXISTS '{val}'")

        # 2. Expand tour_type enum with PRD 10.1 types
        for val in [
            'FIXED_DEPARTURE', 'PRIVATE', 'GROUP', 'GROUND', 'DAY', 'MULTI_DAY',
            'EXPERIENCE', 'COUPLE', 'FOOD', 'PHOTOGRAPHY', 'CORPORATE'
        ]:
            op.execute(f"ALTER TYPE tour_type ADD VALUE IF NOT EXISTS '{val}'")

        # 3. PRD 10.5 "Changes Requested" is a distinct outcome from a flat reject —
        # the admin asks for a revision rather than closing the submission out.
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LISTING_CHANGES_REQUESTED'")
        # PRD 8.2's "Report-profile button" — notifies admins directly rather than
        # a new reports table, see profiles/service.py's report_expert_profile.
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PROFILE_REPORTED'")

    # 3. Local Expert Profiles additions
    op.add_column('local_expert_profiles', sa.Column('primary_destination_id', sa.UUID(), nullable=True))
    op.add_column('local_expert_profiles', sa.Column('secondary_destinations', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('local_expert_profiles', sa.Column('expertise_categories', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('local_expert_profiles', sa.Column('security_verification_status', sa.String(length=50), nullable=False, server_default='verified'))
    op.add_column('local_expert_profiles', sa.Column('emergency_handling_capability', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('local_expert_profiles', sa.Column('emergency_contact_number', sa.String(length=50), nullable=True))
    op.add_column('local_expert_profiles', sa.Column('rating_avg', sa.Numeric(precision=3, scale=2), nullable=False, server_default='5.00'))
    op.add_column('local_expert_profiles', sa.Column('reviews_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('local_expert_profiles', sa.Column('total_tours_conducted', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('local_expert_profiles', sa.Column('response_rate_percent', sa.Integer(), nullable=False, server_default='100'))
    op.add_column('local_expert_profiles', sa.Column('completion_rate_percent', sa.Integer(), nullable=False, server_default='100'))
    op.add_column('local_expert_profiles', sa.Column('cancellation_rate_percent', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('local_expert_profiles', sa.Column('badge_level', sa.String(length=50), nullable=False, server_default='Verified Expert'))
    op.create_foreign_key(None, 'local_expert_profiles', 'locations', ['primary_destination_id'], ['id'], ondelete='SET NULL')

    # Remove server defaults so future inserts rely on model defaults
    op.alter_column('local_expert_profiles', 'security_verification_status', server_default=None)
    op.alter_column('local_expert_profiles', 'emergency_handling_capability', server_default=None)
    op.alter_column('local_expert_profiles', 'rating_avg', server_default=None)
    op.alter_column('local_expert_profiles', 'reviews_count', server_default=None)
    op.alter_column('local_expert_profiles', 'total_tours_conducted', server_default=None)
    op.alter_column('local_expert_profiles', 'response_rate_percent', server_default=None)
    op.alter_column('local_expert_profiles', 'completion_rate_percent', server_default=None)
    op.alter_column('local_expert_profiles', 'cancellation_rate_percent', server_default=None)
    op.alter_column('local_expert_profiles', 'badge_level', server_default=None)

    # 4. Tour sub-resources additions
    op.add_column('tour_activities', sa.Column('day_number', sa.Integer(), nullable=True))
    op.add_column('tour_activities', sa.Column('weather_dependency', sa.String(length=100), nullable=True))
    op.add_column('tour_activities', sa.Column('addon_price', sa.Numeric(precision=10, scale=2), nullable=True))

    op.add_column('tour_departures', sa.Column('return_date', sa.Date(), nullable=True))
    op.add_column('tour_departures', sa.Column('departure_time', sa.String(length=50), nullable=True))
    op.add_column('tour_departures', sa.Column('return_time', sa.String(length=50), nullable=True))
    op.add_column('tour_departures', sa.Column('booking_deadline', sa.DateTime(timezone=True), nullable=True))
    op.add_column('tour_departures', sa.Column('min_participants', sa.Integer(), nullable=True))
    op.add_column('tour_departures', sa.Column('max_participants', sa.Integer(), nullable=True))
    op.add_column('tour_departures', sa.Column('confirmation_threshold', sa.Integer(), nullable=True))
    op.add_column('tour_departures', sa.Column('status', sa.String(length=50), nullable=False, server_default='open'))
    op.alter_column('tour_departures', 'status', server_default=None)
    op.add_column('tour_departures', sa.Column('recurrence_rule', sa.String(length=100), nullable=True))
    op.add_column('tour_departures', sa.Column('assigned_guide_role_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'tour_departures', 'partner_roles', ['assigned_guide_role_id'], ['id'], ondelete='SET NULL')

    op.add_column('tour_itineraries', sa.Column('activity_summary', sa.Text(), nullable=True))
    op.add_column('tour_itineraries', sa.Column('entry_fee_included', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column('tour_itineraries', 'entry_fee_included', server_default=None)
    op.add_column('tour_itineraries', sa.Column('accessibility_notes', sa.Text(), nullable=True))
    op.add_column('tour_itineraries', sa.Column('safety_notes', sa.Text(), nullable=True))

    op.add_column('tour_meals', sa.Column('day_number', sa.Integer(), nullable=True))
    op.add_column('tour_meals', sa.Column('is_vegetarian', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column('tour_meals', 'is_vegetarian', server_default=None)
    op.add_column('tour_meals', sa.Column('is_vegan', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column('tour_meals', 'is_vegan', server_default=None)
    op.add_column('tour_meals', sa.Column('is_halal', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column('tour_meals', 'is_halal', server_default=None)
    op.add_column('tour_meals', sa.Column('allergy_notes', sa.Text(), nullable=True))
    op.add_column('tour_meals', sa.Column('children_menu_available', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column('tour_meals', 'children_menu_available', server_default=None)
    op.add_column('tour_meals', sa.Column('restaurant_provider', sa.String(length=255), nullable=True))
    op.add_column('tour_meals', sa.Column('optional_upgrade_price', sa.Numeric(precision=10, scale=2), nullable=True))

    op.add_column('tour_stays', sa.Column('stay_name', sa.String(length=255), nullable=True))
    op.add_column('tour_stays', sa.Column('occupancy_arrangement', sa.String(length=100), nullable=True))
    op.add_column('tour_stays', sa.Column('room_sharing_policy', sa.String(length=255), nullable=True))
    op.add_column('tour_stays', sa.Column('check_in_out_info', sa.String(length=255), nullable=True))
    op.add_column('tour_stays', sa.Column('stay_location', sa.String(length=255), nullable=True))
    op.add_column('tour_stays', sa.Column('stay_photos', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('tour_stays', sa.Column('source_type', sa.String(length=50), nullable=True))

    op.add_column('tour_transport', sa.Column('provider_name', sa.String(length=255), nullable=True))
    op.add_column('tour_transport', sa.Column('vehicle_model', sa.String(length=100), nullable=True))
    op.add_column('tour_transport', sa.Column('driver_included', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column('tour_transport', 'driver_included', server_default=None)
    op.add_column('tour_transport', sa.Column('intercity_details', sa.Text(), nullable=True))
    op.add_column('tour_transport', sa.Column('local_details', sa.Text(), nullable=True))
    op.add_column('tour_transport', sa.Column('pickup_location', sa.String(length=255), nullable=True))
    op.add_column('tour_transport', sa.Column('pickup_time', sa.String(length=50), nullable=True))
    op.add_column('tour_transport', sa.Column('dropoff_location', sa.String(length=255), nullable=True))
    op.add_column('tour_transport', sa.Column('dropoff_time', sa.String(length=50), nullable=True))
    op.add_column('tour_transport', sa.Column('route_info', sa.Text(), nullable=True))
    op.add_column('tour_transport', sa.Column('luggage_policy', sa.String(length=255), nullable=True))

    # 5. Tour core additions
    op.add_column('tours', sa.Column('short_summary', sa.String(length=500), nullable=True))
    op.add_column('tours', sa.Column('duration_nights', sa.Integer(), nullable=True))
    op.add_column('tours', sa.Column('min_group_size', sa.Integer(), nullable=True))
    op.add_column('tours', sa.Column('suitable_traveler_type', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('tours', sa.Column('primary_destination_id', sa.UUID(), nullable=True))
    op.add_column('tours', sa.Column('price_per_group', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('tours', sa.Column('single_room_supplement', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('tours', sa.Column('couple_price', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('tours', sa.Column('seasonal_pricing', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('tours', sa.Column('weekend_price', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('tours', sa.Column('early_bird_discount', sa.Numeric(precision=5, scale=4), nullable=True))
    op.add_column('tours', sa.Column('group_discount', sa.Numeric(precision=5, scale=4), nullable=True))
    op.add_column('tours', sa.Column('currency', sa.String(length=10), nullable=False, server_default='BDT'))
    op.alter_column('tours', 'currency', server_default=None)
    op.add_column('tours', sa.Column('included_services', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('tours', sa.Column('excluded_services', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('tours', sa.Column('pickup_location', sa.String(length=255), nullable=True))
    op.add_column('tours', sa.Column('pickup_time', sa.String(length=50), nullable=True))
    op.add_column('tours', sa.Column('dropoff_location', sa.String(length=255), nullable=True))
    op.add_column('tours', sa.Column('dropoff_time', sa.String(length=50), nullable=True))
    op.add_column('tours', sa.Column('pickup_coordinates', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('tours', sa.Column('pickup_window', sa.String(length=50), nullable=True))
    op.add_column('tours', sa.Column('pickup_contact_person', sa.String(length=100), nullable=True))
    op.add_column('tours', sa.Column('home_hotel_pickup_available', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column('tours', 'home_hotel_pickup_available', server_default=None)
    op.add_column('tours', sa.Column('home_pickup_extra_charge', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('tours', sa.Column('late_arrival_policy', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('nearest_hospital', sa.String(length=255), nullable=True))
    op.add_column('tours', sa.Column('first_aid_available', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column('tours', 'first_aid_available', server_default=None)
    op.add_column('tours', sa.Column('women_safety_notes', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('child_safety_notes', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('night_travel_policy', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('permit_requirements', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('insurance_included', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column('tours', 'insurance_included', server_default=None)
    op.add_column('tours', sa.Column('emergency_procedure', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('rescheduling_policy', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('min_participant_policy', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('bad_weather_policy', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('no_show_policy', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('pet_policy', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('accessibility_policy', sa.Text(), nullable=True))
    op.add_column('tours', sa.Column('traveler_conduct_policy', sa.Text(), nullable=True))
    op.create_foreign_key(None, 'tours', 'locations', ['primary_destination_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'tours', type_='foreignkey')
    op.drop_column('tours', 'traveler_conduct_policy')
    op.drop_column('tours', 'accessibility_policy')
    op.drop_column('tours', 'pet_policy')
    op.drop_column('tours', 'no_show_policy')
    op.drop_column('tours', 'bad_weather_policy')
    op.drop_column('tours', 'min_participant_policy')
    op.drop_column('tours', 'rescheduling_policy')
    op.drop_column('tours', 'emergency_procedure')
    op.drop_column('tours', 'insurance_included')
    op.drop_column('tours', 'permit_requirements')
    op.drop_column('tours', 'night_travel_policy')
    op.drop_column('tours', 'child_safety_notes')
    op.drop_column('tours', 'women_safety_notes')
    op.drop_column('tours', 'first_aid_available')
    op.drop_column('tours', 'nearest_hospital')
    op.drop_column('tours', 'late_arrival_policy')
    op.drop_column('tours', 'home_pickup_extra_charge')
    op.drop_column('tours', 'home_hotel_pickup_available')
    op.drop_column('tours', 'pickup_contact_person')
    op.drop_column('tours', 'pickup_window')
    op.drop_column('tours', 'pickup_coordinates')
    op.drop_column('tours', 'dropoff_time')
    op.drop_column('tours', 'dropoff_location')
    op.drop_column('tours', 'pickup_time')
    op.drop_column('tours', 'pickup_location')
    op.drop_column('tours', 'excluded_services')
    op.drop_column('tours', 'included_services')
    op.drop_column('tours', 'currency')
    op.drop_column('tours', 'group_discount')
    op.drop_column('tours', 'early_bird_discount')
    op.drop_column('tours', 'weekend_price')
    op.drop_column('tours', 'seasonal_pricing')
    op.drop_column('tours', 'couple_price')
    op.drop_column('tours', 'single_room_supplement')
    op.drop_column('tours', 'price_per_group')
    op.drop_column('tours', 'primary_destination_id')
    op.drop_column('tours', 'suitable_traveler_type')
    op.drop_column('tours', 'min_group_size')
    op.drop_column('tours', 'duration_nights')
    op.drop_column('tours', 'short_summary')
    op.drop_column('tour_transport', 'luggage_policy')
    op.drop_column('tour_transport', 'route_info')
    op.drop_column('tour_transport', 'dropoff_time')
    op.drop_column('tour_transport', 'dropoff_location')
    op.drop_column('tour_transport', 'pickup_time')
    op.drop_column('tour_transport', 'pickup_location')
    op.drop_column('tour_transport', 'local_details')
    op.drop_column('tour_transport', 'intercity_details')
    op.drop_column('tour_transport', 'driver_included')
    op.drop_column('tour_transport', 'vehicle_model')
    op.drop_column('tour_transport', 'provider_name')
    op.drop_column('tour_stays', 'source_type')
    op.drop_column('tour_stays', 'stay_photos')
    op.drop_column('tour_stays', 'stay_location')
    op.drop_column('tour_stays', 'check_in_out_info')
    op.drop_column('tour_stays', 'room_sharing_policy')
    op.drop_column('tour_stays', 'occupancy_arrangement')
    op.drop_column('tour_stays', 'stay_name')
    op.drop_column('tour_meals', 'optional_upgrade_price')
    op.drop_column('tour_meals', 'restaurant_provider')
    op.drop_column('tour_meals', 'children_menu_available')
    op.drop_column('tour_meals', 'allergy_notes')
    op.drop_column('tour_meals', 'is_halal')
    op.drop_column('tour_meals', 'is_vegan')
    op.drop_column('tour_meals', 'is_vegetarian')
    op.drop_column('tour_meals', 'day_number')
    op.drop_column('tour_itineraries', 'safety_notes')
    op.drop_column('tour_itineraries', 'accessibility_notes')
    op.drop_column('tour_itineraries', 'entry_fee_included')
    op.drop_column('tour_itineraries', 'activity_summary')
    op.drop_constraint(None, 'tour_departures', type_='foreignkey')
    op.drop_column('tour_departures', 'assigned_guide_role_id')
    op.drop_column('tour_departures', 'recurrence_rule')
    op.drop_column('tour_departures', 'status')
    op.drop_column('tour_departures', 'confirmation_threshold')
    op.drop_column('tour_departures', 'max_participants')
    op.drop_column('tour_departures', 'min_participants')
    op.drop_column('tour_departures', 'booking_deadline')
    op.drop_column('tour_departures', 'return_time')
    op.drop_column('tour_departures', 'departure_time')
    op.drop_column('tour_departures', 'return_date')
    op.drop_column('tour_activities', 'addon_price')
    op.drop_column('tour_activities', 'weather_dependency')
    op.drop_column('tour_activities', 'day_number')
    op.drop_constraint(None, 'local_expert_profiles', type_='foreignkey')
    op.drop_column('local_expert_profiles', 'badge_level')
    op.drop_column('local_expert_profiles', 'cancellation_rate_percent')
    op.drop_column('local_expert_profiles', 'completion_rate_percent')
    op.drop_column('local_expert_profiles', 'response_rate_percent')
    op.drop_column('local_expert_profiles', 'total_tours_conducted')
    op.drop_column('local_expert_profiles', 'reviews_count')
    op.drop_column('local_expert_profiles', 'rating_avg')
    op.drop_column('local_expert_profiles', 'emergency_contact_number')
    op.drop_column('local_expert_profiles', 'emergency_handling_capability')
    op.drop_column('local_expert_profiles', 'security_verification_status')
    op.drop_column('local_expert_profiles', 'expertise_categories')
    op.drop_column('local_expert_profiles', 'secondary_destinations')
    op.drop_column('local_expert_profiles', 'primary_destination_id')
