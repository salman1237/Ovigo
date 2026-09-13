"""fix esim notification type enum casing

Revision ID: 51c0c8d68cef
Revises: ebe628d13714
Create Date: 2026-09-13 09:41:00.536690

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '51c0c8d68cef'
down_revision: Union[str, None] = 'ebe628d13714'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The prior migration (ebe628d13714) added the lowercase `.value` strings
    # ('esim_ready', 'esim_failed'), but SQLAlchemy's Enum column (no
    # values_callable) stores the Python member NAME, matching every other
    # value already in this enum. The lowercase labels are harmless, unused
    # clutter — left in place since Postgres can't drop enum values without
    # recreating the type.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ESIM_READY'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ESIM_FAILED'")


def downgrade() -> None:
    # Postgres cannot drop enum values.
    pass
