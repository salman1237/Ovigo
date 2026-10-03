"""add suspended to vehicle_status and admin_permissions to users

Revision ID: e7192a38b102
Revises: 56c0f6183bbe
Create Date: 2026-10-03 22:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7192a38b102'
down_revision: Union[str, None] = '56c0f6183bbe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add SUSPENDED to vehicle_status enum. The DB stores the Python enum
    # MEMBER NAME (SQLAlchemy's default for sa.Enum(SomeEnum) with no
    # values_callable), not its .value — matching every existing label on this
    # enum ('DRAFT', 'PENDING_REVIEW', ...), so this must be uppercase too.
    # Also must run outside the migration's transaction block — see
    # 5a3f9e1c7b28's fraud_rule_type expansion for the established pattern.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE vehicle_status ADD VALUE IF NOT EXISTS 'SUSPENDED'")

    # 2. Add admin_permissions column to users table
    op.add_column('users', sa.Column('admin_permissions', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'admin_permissions')
