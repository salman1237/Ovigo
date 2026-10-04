"""phase 9.1 expert referral links and network attributions

Adds the expert referral link + network attribution tables (referrals/models.py),
`commissions.attribution_id`, `users.signup_referral_link_id`, and two
notification types. Backfills an ACTIVE attribution for every already-approved
BusinessReferral linked to a partner role, so experts who earn NETWORK commission
today keep earning after the commission engine switches to reading attributions,
and points existing NETWORK commission rows at their attribution.

Revision ID: fb448f21f6f4
Revises: e7192a38b102
Create Date: 2026-10-04 05:32:39.264703

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'fb448f21f6f4'
down_revision: Union[str, None] = 'e7192a38b102'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New values on an existing native enum must be added outside the migration's
    # transaction, and stored by member NAME (this codebase's convention).
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'NETWORK_MEMBER_JOINED'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'NETWORK_MEMBER_ACTIVATED'")

    op.create_table('expert_referral_links',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('expert_role_id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=16), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('visit_count', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('deactivated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['expert_role_id'], ['partner_roles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_expert_referral_links_expert_role_id'), 'expert_referral_links', ['expert_role_id'], unique=False)
    op.create_index('uq_expert_referral_links_active_expert', 'expert_referral_links', ['expert_role_id'], unique=True, postgresql_where=sa.text('is_active'))
    op.create_table('network_attributions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('referring_expert_role_id', sa.UUID(), nullable=False),
    sa.Column('referred_user_id', sa.UUID(), nullable=False),
    sa.Column('referred_partner_role_id', sa.UUID(), nullable=False),
    # partner_role_type already exists — the dialect-specific ENUM class is the one
    # that actually honors create_type=False (plain sa.Enum ignores it).
    sa.Column('role_type', postgresql.ENUM('LOCAL_EXPERT', 'HOST', 'GUIDE', 'HOTEL', 'RENT_A_CAR', name='partner_role_type', create_type=False), nullable=False),
    sa.Column('source', sa.Enum('REFERRAL_LINK', 'BUSINESS_REFERRAL', 'ADMIN', name='network_attribution_source'), nullable=False),
    sa.Column('referral_link_id', sa.UUID(), nullable=True),
    sa.Column('business_referral_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.Enum('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED', name='network_attribution_status'), nullable=False),
    sa.Column('custom_commission_rate', sa.Numeric(precision=5, scale=4), nullable=True),
    sa.Column('commission_starts_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('commission_expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('terms_version', sa.String(length=20), nullable=True),
    sa.Column('revoked_reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['business_referral_id'], ['business_referrals.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['referral_link_id'], ['expert_referral_links.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['referred_partner_role_id'], ['partner_roles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['referred_user_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['referring_expert_role_id'], ['partner_roles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('referred_partner_role_id')
    )
    op.create_index(op.f('ix_network_attributions_referred_user_id'), 'network_attributions', ['referred_user_id'], unique=False)
    op.create_index(op.f('ix_network_attributions_referring_expert_role_id'), 'network_attributions', ['referring_expert_role_id'], unique=False)
    op.add_column('commissions', sa.Column('attribution_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_commissions_attribution_id'), 'commissions', ['attribution_id'], unique=False)
    op.create_foreign_key('fk_commissions_attribution_id', 'commissions', 'network_attributions', ['attribution_id'], ['id'], ondelete='SET NULL')
    op.add_column('users', sa.Column('signup_referral_link_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_users_signup_referral_link_id', 'users', 'expert_referral_links', ['signup_referral_link_id'], ['id'], ondelete='SET NULL')

    # Backfill: every approved BusinessReferral already linked to a partner role was
    # earning a NETWORK cut under the old engine — give it an attribution so it keeps
    # earning. Starts at the referral's own creation; expires 12 months from now
    # (none of these had an expiry before). Self-referrals and Local Expert roles are
    # skipped: neither can be attributed under the new rules.
    op.execute("""
        INSERT INTO network_attributions (
            id, referring_expert_role_id, referred_user_id, referred_partner_role_id, role_type,
            source, business_referral_id, status, custom_commission_rate,
            commission_starts_at, commission_expires_at, created_at, updated_at
        )
        SELECT
            gen_random_uuid(), br.referring_expert_role_id, pa.user_id, br.linked_partner_role_id, pr.role_type,
            'BUSINESS_REFERRAL', br.id,
            CASE WHEN pr.status IN ('APPROVED', 'SUSPENDED') THEN 'ACTIVE' ELSE 'PENDING' END::network_attribution_status,
            br.custom_commission_rate,
            CASE WHEN pr.status IN ('APPROVED', 'SUSPENDED') THEN br.created_at END,
            CASE WHEN pr.status IN ('APPROVED', 'SUSPENDED') THEN now() + interval '12 months' END,
            now(), now()
        FROM business_referrals br
        JOIN partner_roles pr ON pr.id = br.linked_partner_role_id
        JOIN partner_accounts pa ON pa.id = pr.partner_account_id
        JOIN partner_roles er ON er.id = br.referring_expert_role_id
        JOIN partner_accounts ea ON ea.id = er.partner_account_id
        WHERE br.status = 'APPROVED'
          AND br.linked_partner_role_id IS NOT NULL
          AND pr.role_type <> 'LOCAL_EXPERT'
          AND pa.user_id <> ea.user_id
        ON CONFLICT (referred_partner_role_id) DO NOTHING
    """)
    # Point existing NETWORK rows at their attribution: the DIRECT row on the same
    # booking item names the referred partner, the NETWORK row names the referrer.
    op.execute("""
        UPDATE commissions n
        SET attribution_id = na.id
        FROM commissions d
        JOIN network_attributions na ON na.referred_partner_role_id = d.partner_role_id
        WHERE n.source = 'NETWORK'
          AND d.source = 'DIRECT'
          AND d.booking_item_id = n.booking_item_id
          AND na.referring_expert_role_id = n.partner_role_id
          AND n.attribution_id IS NULL
    """)


def downgrade() -> None:
    op.drop_constraint('fk_users_signup_referral_link_id', 'users', type_='foreignkey')
    op.drop_column('users', 'signup_referral_link_id')
    op.drop_constraint('fk_commissions_attribution_id', 'commissions', type_='foreignkey')
    op.drop_index(op.f('ix_commissions_attribution_id'), table_name='commissions')
    op.drop_column('commissions', 'attribution_id')
    op.drop_index(op.f('ix_network_attributions_referring_expert_role_id'), table_name='network_attributions')
    op.drop_index(op.f('ix_network_attributions_referred_user_id'), table_name='network_attributions')
    op.drop_table('network_attributions')
    op.drop_index('uq_expert_referral_links_active_expert', table_name='expert_referral_links', postgresql_where=sa.text('is_active'))
    op.drop_index(op.f('ix_expert_referral_links_expert_role_id'), table_name='expert_referral_links')
    op.drop_table('expert_referral_links')
    op.execute("DROP TYPE IF EXISTS network_attribution_source")
    op.execute("DROP TYPE IF EXISTS network_attribution_status")
    # The two notification_type values stay: Postgres can't drop an enum value.
