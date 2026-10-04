"""phase 9.2 acquisition channel seller attribution tour curation

PRD §12.4/§12.5 attribution: `bookings.acquisition_channel` (+ the acquiring
expert / ad campaign), `booking_items.sold_by_role_id` and `curated_by_tour_id`,
the CURATION commission source/scope, and a CATEGORY commission rule for
RIDE_BID items (which previously generated no commission at all — the engine
had no partner lookup for them). Backfills sold_by_role_id for existing items
from each listing's owner; acquisition_channel stays NULL ("unknown") for
bookings made before tracking existed.

Revision ID: 7438eef3baa7
Revises: fb448f21f6f4
Create Date: 2026-10-04 05:52:54.797004

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7438eef3baa7'
down_revision: Union[str, None] = 'fb448f21f6f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE commission_source ADD VALUE IF NOT EXISTS 'CURATION'")
        op.execute("ALTER TYPE commission_rule_scope ADD VALUE IF NOT EXISTS 'CURATION'")

    op.add_column('booking_items', sa.Column('sold_by_role_id', sa.UUID(), nullable=True))
    op.add_column('booking_items', sa.Column('curated_by_tour_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_booking_items_curated_by_tour_id', 'booking_items', 'tours', ['curated_by_tour_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_booking_items_sold_by_role_id', 'booking_items', 'partner_roles', ['sold_by_role_id'], ['id'], ondelete='SET NULL')
    # add_column (unlike create_table) doesn't create a new enum type on its own.
    acquisition_channel = postgresql.ENUM('ORGANIC', 'EXPERT', 'ADVERTISING', name='booking_acquisition_channel', create_type=False)
    acquisition_channel.create(op.get_bind(), checkfirst=True)
    op.add_column('bookings', sa.Column('acquisition_channel', acquisition_channel, nullable=True))
    op.add_column('bookings', sa.Column('acquisition_expert_role_id', sa.UUID(), nullable=True))
    op.add_column('bookings', sa.Column('ad_campaign_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_bookings_ad_campaign_id', 'bookings', 'ad_campaigns', ['ad_campaign_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_bookings_acquisition_expert_role_id', 'bookings', 'partner_roles', ['acquisition_expert_role_id'], ['id'], ondelete='SET NULL')

    # Who sold each existing item = the listing's owner (no curated bookings existed yet).
    op.execute("""
        UPDATE booking_items bi SET sold_by_role_id = t.local_expert_role_id
        FROM tour_departures td JOIN tours t ON t.id = td.tour_id
        WHERE bi.tour_departure_id = td.id AND bi.sold_by_role_id IS NULL
    """)
    op.execute("""
        UPDATE booking_items bi SET sold_by_role_id = p.host_role_id
        FROM room_types rt JOIN properties p ON p.id = rt.property_id
        WHERE bi.room_type_id = rt.id AND bi.sold_by_role_id IS NULL
    """)
    op.execute("""
        UPDATE booking_items bi SET sold_by_role_id = v.rent_a_car_role_id
        FROM vehicles v WHERE bi.vehicle_id = v.id AND bi.sold_by_role_id IS NULL
    """)
    op.execute("""
        UPDATE booking_items bi SET sold_by_role_id = b.local_expert_role_id
        FROM tour_bids b WHERE bi.custom_bid_id = b.id AND bi.sold_by_role_id IS NULL
    """)
    op.execute("""
        UPDATE booking_items bi SET sold_by_role_id = rb.rent_a_car_role_id
        FROM ride_bids rb WHERE bi.ride_bid_id = rb.id AND bi.sold_by_role_id IS NULL
    """)

    # RIDE_BID gets the same default rate as VEHICLE_RENTAL, unless an admin already
    # created one.
    op.execute("""
        INSERT INTO commission_rules (id, scope, item_type, partner_role_id, rate, is_active, created_at, updated_at)
        SELECT gen_random_uuid(), 'CATEGORY', 'RIDE_BID', NULL, 0.12, true, now(), now()
        WHERE NOT EXISTS (
            SELECT 1 FROM commission_rules WHERE scope = 'CATEGORY' AND item_type = 'RIDE_BID'
        )
    """)


def downgrade() -> None:
    op.drop_constraint('fk_bookings_acquisition_expert_role_id', 'bookings', type_='foreignkey')
    op.drop_constraint('fk_bookings_ad_campaign_id', 'bookings', type_='foreignkey')
    op.drop_column('bookings', 'ad_campaign_id')
    op.drop_column('bookings', 'acquisition_expert_role_id')
    op.drop_column('bookings', 'acquisition_channel')
    op.execute("DROP TYPE IF EXISTS booking_acquisition_channel")
    op.drop_constraint('fk_booking_items_sold_by_role_id', 'booking_items', type_='foreignkey')
    op.drop_constraint('fk_booking_items_curated_by_tour_id', 'booking_items', type_='foreignkey')
    op.drop_column('booking_items', 'curated_by_tour_id')
    op.drop_column('booking_items', 'sold_by_role_id')
    # The seeded RIDE_BID rule and the CURATION enum values are left in place: the
    # rule is harmless without the engine change, and Postgres can't drop enum values.
