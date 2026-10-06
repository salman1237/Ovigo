"""add is_trusted to local_expert_profiles

Phase 9.6: admin-set trust flag that triggers auto-approval of tours from this
expert when the tour has no high-risk activities (PRD §10.5).

Revision ID: a1b2c3d4e5f6
Revises: d4e7f3a9b1c2
Create Date: 2026-10-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "d4e7f3a9b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "local_expert_profiles",
        sa.Column("is_trusted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("local_expert_profiles", "is_trusted")
