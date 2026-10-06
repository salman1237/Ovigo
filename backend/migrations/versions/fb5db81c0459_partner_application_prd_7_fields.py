"""partner application PRD §7 fields

Revision ID: fb5db81c0459
Revises: a1b2c3d4e5f6
Create Date: 2026-10-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'fb5db81c0459'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. New document_type values (PRD §7.3/§7.5 docs not previously representable).
    # Native enum extension must run outside the migration's transaction block —
    # see e7192a38b102's vehicle_status expansion for the established pattern.
    with op.get_context().autocommit_block():
        for value in ('UTILITY_BILL', 'FITNESS_CERTIFICATE', 'INSURANCE', 'DRIVER_LICENSE', 'POLICE_CLEARANCE', 'FIRST_AID_CERTIFICATE'):
            op.execute(f"ALTER TYPE document_type ADD VALUE IF NOT EXISTS '{value}'")

    # 2. Two new small enums for the common PRD §7.1 fields.
    national_id_type = postgresql.ENUM('ID_CARD', 'PASSPORT', name='national_id_type')
    national_id_type.create(op.get_bind())
    payout_method = postgresql.ENUM('BANK', 'MOBILE_FINANCIAL_SERVICE', name='payout_method')
    payout_method.create(op.get_bind())

    # 3. New columns on partner_role_applications — nullable so existing rows and
    # other code paths aren't broken; service.apply_for_role enforces these as
    # required for new submissions.
    op.add_column('partner_role_applications', sa.Column('full_legal_name', sa.String(length=255), nullable=True))
    op.add_column('partner_role_applications', sa.Column('contact_mobile_number', sa.String(length=32), nullable=True))
    op.add_column('partner_role_applications', sa.Column('national_id_type', sa.Enum('ID_CARD', 'PASSPORT', name='national_id_type'), nullable=True))
    op.add_column('partner_role_applications', sa.Column('national_id_number', sa.String(length=64), nullable=True))
    op.add_column('partner_role_applications', sa.Column('permanent_address', sa.Text(), nullable=True))
    op.add_column('partner_role_applications', sa.Column('current_address', sa.Text(), nullable=True))
    op.add_column('partner_role_applications', sa.Column('emergency_contact_name', sa.String(length=255), nullable=True))
    op.add_column('partner_role_applications', sa.Column('emergency_contact_phone', sa.String(length=32), nullable=True))
    op.add_column('partner_role_applications', sa.Column('payout_method', sa.Enum('BANK', 'MOBILE_FINANCIAL_SERVICE', name='payout_method'), nullable=True))
    op.add_column('partner_role_applications', sa.Column('payout_provider_name', sa.String(length=255), nullable=True))
    op.add_column('partner_role_applications', sa.Column('payout_account_name', sa.String(length=255), nullable=True))
    op.add_column('partner_role_applications', sa.Column('payout_account_number', sa.String(length=64), nullable=True))
    op.add_column('partner_role_applications', sa.Column('tax_id', sa.String(length=64), nullable=True))
    op.add_column('partner_role_applications', sa.Column('agreed_to_partner_terms', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('partner_role_applications', sa.Column('agreed_to_background_check', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('partner_role_applications', sa.Column('role_details', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('partner_role_applications', 'role_details')
    op.drop_column('partner_role_applications', 'agreed_to_background_check')
    op.drop_column('partner_role_applications', 'agreed_to_partner_terms')
    op.drop_column('partner_role_applications', 'tax_id')
    op.drop_column('partner_role_applications', 'payout_account_number')
    op.drop_column('partner_role_applications', 'payout_account_name')
    op.drop_column('partner_role_applications', 'payout_provider_name')
    op.drop_column('partner_role_applications', 'payout_method')
    op.drop_column('partner_role_applications', 'emergency_contact_phone')
    op.drop_column('partner_role_applications', 'emergency_contact_name')
    op.drop_column('partner_role_applications', 'current_address')
    op.drop_column('partner_role_applications', 'permanent_address')
    op.drop_column('partner_role_applications', 'national_id_number')
    op.drop_column('partner_role_applications', 'national_id_type')
    op.drop_column('partner_role_applications', 'contact_mobile_number')
    op.drop_column('partner_role_applications', 'full_legal_name')
    op.execute('DROP TYPE payout_method')
    op.execute('DROP TYPE national_id_type')
    # document_type's new values are not removed on downgrade (removing enum
    # values is unsafe if any row already uses them) — matches this codebase's
    # existing convention (see e7192a38b102's downgrade, which leaves 'SUSPENDED').
