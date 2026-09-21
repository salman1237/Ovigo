"""add role and account suspension notification types

Revision ID: 79291d86ec18
Revises: e0a183f58d74
Create Date: 2026-09-21 10:44:23.548540

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '79291d86ec18'
down_revision: Union[str, None] = 'e0a183f58d74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ROLE_SUSPENDED'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ROLE_REINSTATED'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ACCOUNT_SUSPENDED'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ACCOUNT_REACTIVATED'")


def downgrade() -> None:
    # Postgres cannot drop enum values.
    pass
