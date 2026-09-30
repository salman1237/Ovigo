"""add rent-a-car ride bidding module

Revision ID: a8f3c1d9e442
Revises: 7d947b797b38
Create Date: 2026-10-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a8f3c1d9e442'
down_revision: Union[str, None] = '7d947b797b38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate doesn't detect new values on an existing native enum.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE booking_item_type ADD VALUE IF NOT EXISTS 'RIDE_BID'")

    op.create_table(
        'ride_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('traveler_id', sa.UUID(), nullable=False),
        sa.Column('pickup_label', sa.String(length=255), nullable=False),
        sa.Column('pickup_lat', sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column('pickup_lng', sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column('dropoff_label', sa.String(length=255), nullable=False),
        sa.Column('dropoff_lat', sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column('dropoff_lng', sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column('departure_date', sa.Date(), nullable=False),
        sa.Column('departure_time', sa.Time(), nullable=True),
        sa.Column('passengers', sa.Integer(), nullable=False),
        sa.Column('vehicle_type_preference', postgresql.ENUM('SEDAN', 'SUV', 'VAN', 'MICROBUS', 'MOTORCYCLE', 'PICKUP', name='vehicle_type', create_type=False), nullable=True),
        sa.Column('with_driver_preference', sa.Boolean(), nullable=True),
        sa.Column('budget_min', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('budget_max', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('bid_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.Enum('OPEN', 'CLOSED', 'CANCELLED', name='ride_request_status'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['traveler_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ride_requests_traveler_id'), 'ride_requests', ['traveler_id'], unique=False)

    op.create_table(
        'ride_bids',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('request_id', sa.UUID(), nullable=False),
        sa.Column('rent_a_car_role_id', sa.UUID(), nullable=False),
        sa.Column('vehicle_id', sa.UUID(), nullable=True),
        sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('with_driver', sa.Boolean(), nullable=False),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.Enum('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', name='ride_bid_status'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['rent_a_car_role_id'], ['partner_roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['request_id'], ['ride_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('request_id', 'rent_a_car_role_id', name='uq_ride_bid_per_partner_per_request'),
    )
    op.create_index(op.f('ix_ride_bids_rent_a_car_role_id'), 'ride_bids', ['rent_a_car_role_id'], unique=False)
    op.create_index(op.f('ix_ride_bids_request_id'), 'ride_bids', ['request_id'], unique=False)

    op.add_column('booking_items', sa.Column('ride_bid_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'booking_items', 'ride_bids', ['ride_bid_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'booking_items', type_='foreignkey')
    op.drop_column('booking_items', 'ride_bid_id')
    op.drop_index(op.f('ix_ride_bids_request_id'), table_name='ride_bids')
    op.drop_index(op.f('ix_ride_bids_rent_a_car_role_id'), table_name='ride_bids')
    op.drop_table('ride_bids')
    op.drop_index(op.f('ix_ride_requests_traveler_id'), table_name='ride_requests')
    op.drop_table('ride_requests')
    # Postgres cannot drop enum values.
