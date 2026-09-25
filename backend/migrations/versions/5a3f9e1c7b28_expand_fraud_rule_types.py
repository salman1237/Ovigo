"""expand fraud rule types

Revision ID: 5a3f9e1c7b28
Revises: 2362ac8a82e6
Create Date: 2026-09-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '5a3f9e1c7b28'
down_revision: Union[str, None] = '2362ac8a82e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate doesn't detect new values on an existing native enum.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE fraud_rule_type ADD VALUE IF NOT EXISTS 'SUDDEN_PRICE_CHANGE'")
        op.execute("ALTER TYPE fraud_rule_type ADD VALUE IF NOT EXISTS 'DUPLICATE_PROPERTY_LISTING'")
        op.execute("ALTER TYPE fraud_rule_type ADD VALUE IF NOT EXISTS 'EXPIRED_VEHICLE_DOCUMENT'")
        op.execute("ALTER TYPE fraud_rule_type ADD VALUE IF NOT EXISTS 'HIGH_REFUND_RATE'")
        op.execute("ALTER TYPE fraud_rule_type ADD VALUE IF NOT EXISTS 'REFERRAL_NETWORK_VOLUME'")
        op.execute("ALTER TYPE fraud_rule_type ADD VALUE IF NOT EXISTS 'INSTANT_CANCELLATION_PATTERN'")


def downgrade() -> None:
    # Postgres cannot drop enum values.
    pass
