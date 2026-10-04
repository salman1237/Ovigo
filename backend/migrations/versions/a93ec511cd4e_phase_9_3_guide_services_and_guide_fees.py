"""phase 9.3 guide services and guide fees

Guides become a real earning channel (PRD §10.8–10.9):
- `guide_profiles` (an admin-reviewed public listing) and `guide_service_packages`
  (the guide's own priced services, e.g. Half day 800 / Full day 1400);
- the GUIDE_SERVICE booking item type, with `booking_items.guide_package_id`;
- guide fees for expert assignments, paid through Ovigo: `guide_assignments.package_id`,
  and commission rows that come from a guide assignment instead of a booking item
  (`commissions.guide_assignment_id`, `booking_item_id` now nullable, exactly one
  of the two set), with the GUIDE_FEE / GUIDE_FEE_DEDUCTION sources;
- a guide can work with several experts: supervision is unique per (guide, expert);
- GUIDE_INVITE attributions (an expert who invites a new guide onboarded them) and
  the GUIDE_BOOKED notification.

The 12% CATEGORY rules, including GUIDE_SERVICE's, are seeded by the next
migration: Postgres can't use an enum value in the transaction that added it.

Revision ID: a93ec511cd4e
Revises: 7438eef3baa7
Create Date: 2026-10-04 10:08:43.888702

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a93ec511cd4e'
down_revision: Union[str, None] = '7438eef3baa7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE booking_item_type ADD VALUE IF NOT EXISTS 'GUIDE_SERVICE'")
        op.execute("ALTER TYPE commission_source ADD VALUE IF NOT EXISTS 'GUIDE_FEE'")
        op.execute("ALTER TYPE commission_source ADD VALUE IF NOT EXISTS 'GUIDE_FEE_DEDUCTION'")
        op.execute("ALTER TYPE network_attribution_source ADD VALUE IF NOT EXISTS 'GUIDE_INVITE'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GUIDE_BOOKED'")

    op.create_table('guide_profiles',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('guide_role_id', sa.UUID(), nullable=False),
    sa.Column('headline', sa.String(length=255), nullable=True),
    sa.Column('bio', sa.Text(), nullable=True),
    sa.Column('city', sa.String(length=120), nullable=True),
    sa.Column('languages', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('years_experience', sa.Integer(), nullable=True),
    sa.Column('status', sa.Enum('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED', name='guide_profile_status'), nullable=False),
    sa.Column('rejection_reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['guide_role_id'], ['partner_roles.id'], name='fk_guide_profiles_guide_role_id', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('guide_role_id', name='uq_guide_profiles_guide_role_id')
    )
    op.create_table('guide_service_packages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('guide_role_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('duration_hours', sa.Numeric(precision=4, scale=1), nullable=True),
    sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['guide_role_id'], ['partner_roles.id'], name='fk_guide_service_packages_guide_role_id', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_guide_service_packages_guide_role_id'), 'guide_service_packages', ['guide_role_id'], unique=False)

    op.add_column('booking_items', sa.Column('guide_package_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_booking_items_guide_package_id', 'booking_items', 'guide_service_packages', ['guide_package_id'], ['id'], ondelete='SET NULL')

    op.add_column('guide_assignments', sa.Column('package_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_guide_assignments_package_id', 'guide_assignments', 'guide_service_packages', ['package_id'], ['id'], ondelete='SET NULL')

    op.add_column('commissions', sa.Column('guide_assignment_id', sa.UUID(), nullable=True))
    op.alter_column('commissions', 'booking_item_id', existing_type=sa.UUID(), nullable=True)
    op.create_index(op.f('ix_commissions_guide_assignment_id'), 'commissions', ['guide_assignment_id'], unique=False)
    op.create_unique_constraint('uq_commission_per_assignment_partner_source', 'commissions', ['guide_assignment_id', 'partner_role_id', 'source'])
    op.create_foreign_key('fk_commissions_guide_assignment_id', 'commissions', 'guide_assignments', ['guide_assignment_id'], ['id'], ondelete='CASCADE')
    # Every existing row has a booking item, so this validates against live data.
    op.create_check_constraint('ck_commission_one_origin', 'commissions', '(booking_item_id IS NULL) <> (guide_assignment_id IS NULL)')

    # At most one row per guide existed before, so the pair constraint holds already.
    op.execute("ALTER TABLE guide_supervision DROP CONSTRAINT IF EXISTS uq_guide_single_supervisor")
    op.create_unique_constraint('uq_guide_supervision_pair', 'guide_supervision', ['guide_role_id', 'local_expert_role_id'])


def downgrade() -> None:
    # Fails if a guide already works with more than one expert, or if any commission
    # came from a guide assignment: both are data this schema can't represent.
    op.drop_constraint('uq_guide_supervision_pair', 'guide_supervision', type_='unique')
    op.create_unique_constraint('uq_guide_single_supervisor', 'guide_supervision', ['guide_role_id'])
    op.drop_constraint('ck_commission_one_origin', 'commissions', type_='check')
    op.drop_constraint('fk_commissions_guide_assignment_id', 'commissions', type_='foreignkey')
    op.drop_constraint('uq_commission_per_assignment_partner_source', 'commissions', type_='unique')
    op.drop_index(op.f('ix_commissions_guide_assignment_id'), table_name='commissions')
    op.alter_column('commissions', 'booking_item_id', existing_type=sa.UUID(), nullable=False)
    op.drop_column('commissions', 'guide_assignment_id')
    op.drop_constraint('fk_guide_assignments_package_id', 'guide_assignments', type_='foreignkey')
    op.drop_column('guide_assignments', 'package_id')
    op.drop_constraint('fk_booking_items_guide_package_id', 'booking_items', type_='foreignkey')
    op.drop_column('booking_items', 'guide_package_id')
    op.drop_index(op.f('ix_guide_service_packages_guide_role_id'), table_name='guide_service_packages')
    op.drop_table('guide_service_packages')
    op.drop_table('guide_profiles')
    op.execute("DROP TYPE IF EXISTS guide_profile_status")
    # The added enum values stay: Postgres can't drop enum values.
