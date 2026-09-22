"""add payout lifecycle statuses

Revision ID: a1c9f3e7b204
Revises: d16467b94b38
Create Date: 2026-09-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c9f3e7b204'
down_revision: Union[str, None] = 'd16467b94b38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'PENDING'")
        op.execute("ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'PROCESSING'")
        op.execute("ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'FAILED'")
        op.execute("ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'REVERSED'")
        op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PAYOUT_FAILED'")

    op.add_column('payouts', sa.Column('reference', sa.String(length=120), nullable=True))
    op.add_column('payouts', sa.Column('note', sa.String(length=500), nullable=True))
    op.add_column(
        'payouts',
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # paid_at used to be set at creation time (a payout was marked PAID immediately);
    # now it's only set once an admin confirms the transfer, so existing rows keep
    # their historical value but the column becomes optional going forward.
    op.alter_column('payouts', 'paid_at', nullable=True, server_default=None)

    # New batches are created PENDING now instead of PAID immediately — existing
    # PAID rows are untouched, this only changes the default for new inserts.
    op.alter_column('payouts', 'status', server_default='PENDING')


def downgrade() -> None:
    op.alter_column('payouts', 'status', server_default='PAID')
    op.alter_column('payouts', 'paid_at', nullable=False, server_default=sa.func.now())
    op.drop_column('payouts', 'updated_at')
    op.drop_column('payouts', 'note')
    op.drop_column('payouts', 'reference')
    # Postgres cannot drop enum values.
