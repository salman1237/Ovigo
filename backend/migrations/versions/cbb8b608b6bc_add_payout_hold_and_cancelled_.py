"""add payout hold and cancelled commission statuses

Revision ID: cbb8b608b6bc
Revises: f023e6f58693
Create Date: 2026-09-01 15:23:08.497313

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cbb8b608b6bc'
down_revision: Union[str, None] = 'f023e6f58693'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE commission_status ADD VALUE IF NOT EXISTS 'ON_HOLD'")
    op.execute("ALTER TYPE commission_status ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    # Postgres has no ALTER TYPE ... DROP VALUE — removing an enum value requires
    # rebuilding the type, not attempted here (same precedent as every other
    # ADD VALUE migration in this project).
    pass
