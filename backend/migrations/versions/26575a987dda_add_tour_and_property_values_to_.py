"""add tour and property values to taggable_entity_type enum

Revision ID: 26575a987dda
Revises: ad3271d7435b
Create Date: 2026-08-30 13:30:25.980332

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26575a987dda'
down_revision: Union[str, None] = 'ad3271d7435b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Alembic's autogenerate doesn't detect new values on an existing native enum type —
    # only new/dropped tables and columns. Add them explicitly. Safe to run more than
    # once (IF NOT EXISTS), and the new values aren't used until a later transaction.
    op.execute("ALTER TYPE taggable_entity_type ADD VALUE IF NOT EXISTS 'TOUR'")
    op.execute("ALTER TYPE taggable_entity_type ADD VALUE IF NOT EXISTS 'PROPERTY'")


def downgrade() -> None:
    # PostgreSQL has no ALTER TYPE ... DROP VALUE. Downgrading would require rebuilding
    # the enum type (create new type, migrate column, drop old) — not worth it for a
    # dev-stage schema; skip.
    pass
