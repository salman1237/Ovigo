"""seed vehicle rental commission rule

Revision ID: 7d47c6cabae8
Revises: 103e64d2b3e9
Create Date: 2026-09-01 13:56:27.799636

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d47c6cabae8'
down_revision: Union[str, None] = '103e64d2b3e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Split into its own migration (rather than the one that added the VEHICLE_RENTAL
    # enum value) because Postgres won't let a brand-new enum value be used — including
    # in a data INSERT — in the same transaction that added it via ALTER TYPE ADD VALUE.
    op.execute(
        """
        INSERT INTO commission_rules (id, scope, item_type, partner_role_id, rate, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'CATEGORY', 'VEHICLE_RENTAL', NULL, 0.12, true, now(), now())
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM commission_rules WHERE item_type = 'VEHICLE_RENTAL' AND scope = 'CATEGORY'")
