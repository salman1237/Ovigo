"""add admin permission role for granular RBAC

Revision ID: d16467b94b38
Revises: 694ee83d4d9d
Create Date: 2026-09-21 23:20:09.249997

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd16467b94b38'
down_revision: Union[str, None] = '694ee83d4d9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A brand-new Postgres enum type needs an explicit CREATE TYPE first — unlike
    # ALTER TYPE ... ADD VALUE on an existing enum, add_column with an inline
    # sa.Enum(...) doesn't auto-create the type in this Alembic/driver combination
    # (same fix as the earlier tour_type migration).
    admin_permission_role_enum = postgresql.ENUM(
        'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT', 'MODERATOR', 'VERIFICATION_TEAM',
        name='admin_permission_role',
    )
    admin_permission_role_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('users', sa.Column('admin_permission_role', admin_permission_role_enum, nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'admin_permission_role')
    postgresql.ENUM(name='admin_permission_role').drop(op.get_bind(), checkfirst=True)
