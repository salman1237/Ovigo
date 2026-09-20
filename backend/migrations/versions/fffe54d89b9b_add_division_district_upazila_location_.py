"""add division district upazila location types

Revision ID: fffe54d89b9b
Revises: 51c0c8d68cef
Create Date: 2026-09-20 23:15:52.374975

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fffe54d89b9b'
down_revision: Union[str, None] = '51c0c8d68cef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE location_type ADD VALUE IF NOT EXISTS 'DIVISION'")
        op.execute("ALTER TYPE location_type ADD VALUE IF NOT EXISTS 'DISTRICT'")
        op.execute("ALTER TYPE location_type ADD VALUE IF NOT EXISTS 'UPAZILA'")


def downgrade() -> None:
    # Postgres cannot drop enum values.
    pass
