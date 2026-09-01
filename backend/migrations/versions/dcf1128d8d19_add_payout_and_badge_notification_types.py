"""add payout and badge notification types

Revision ID: dcf1128d8d19
Revises: 90d30f4af0fc
Create Date: 2026-09-01 12:30:42.162202

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dcf1128d8d19'
down_revision: Union[str, None] = '90d30f4af0fc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Alembic's autogenerate doesn't detect new values on an existing native enum type —
    # these four NotificationType members were added in the same code change as the
    # previous migration but missed there. Safe to run more than once (IF NOT EXISTS).
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PAYOUT_PROCESSED'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'BADGE_APPROVED'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'BADGE_REJECTED'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'BADGE_AUTO_AWARDED'")


def downgrade() -> None:
    # PostgreSQL has no ALTER TYPE ... DROP VALUE — see the taggable_entity_type precedent.
    pass
