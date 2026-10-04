"""expert chat context

A traveler can message a Local Expert straight from their public profile (PRD
§8.2 "Live-chat button"), not only from one of their tours: a new EXPERT chat
context whose context_id is the expert's partner role.

Revision ID: c593bd0272ed
Revises: fd7230d031d9
Create Date: 2026-10-04 13:41:55.654114

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c593bd0272ed'
down_revision: Union[str, None] = 'fd7230d031d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE chat_context_type ADD VALUE IF NOT EXISTS 'EXPERT'")


def downgrade() -> None:
    # Postgres can't drop an enum value; EXPERT threads (if any) stay readable.
    pass
