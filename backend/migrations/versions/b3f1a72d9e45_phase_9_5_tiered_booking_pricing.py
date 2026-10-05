"""Phase 9.5: tiered checkout pricing (adults/children/infants)

Adds adults_count, children_count, infants_count columns to booking_items so
the typed traveler breakdown is stored for each tour-departure item.  Legacy
items without a breakdown keep these columns null.

Also fixes bookable-statuses bug (B4): BOOKABLE_TOUR_STATUSES is now used in
service code (no schema change needed there — pure Python).

Revision ID: b3f1a72d9e45
Revises: c593bd0272ed
Create Date: 2026-10-05 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b3f1a72d9e45"
down_revision: Union[str, None] = "c593bd0272ed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("booking_items", sa.Column("adults_count", sa.Integer(), nullable=True))
    op.add_column("booking_items", sa.Column("children_count", sa.Integer(), nullable=True))
    op.add_column("booking_items", sa.Column("infants_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("booking_items", "infants_count")
    op.drop_column("booking_items", "children_count")
    op.drop_column("booking_items", "adults_count")
