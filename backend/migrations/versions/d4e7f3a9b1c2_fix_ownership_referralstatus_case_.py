"""fix ownership_type and referral_status case normalization

The original business_referrals table was created with UPPERCASE enum values
('OWNED', 'REFERRED', 'PENDING', 'APPROVED', 'REJECTED'). Phase 9.4 lowercased
the Python model values but did not normalize existing database rows. This
migration adds lowercase labels to both Postgres enums and migrates all existing
data rows to use lowercase, so the ORM can load them without a coercion failure.

Revision ID: d4e7f3a9b1c2
Revises: cf2033d11142
Create Date: 2026-10-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d4e7f3a9b1c2"
down_revision: Union[str, None] = "cf2033d11142"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE … ADD VALUE must run outside a transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE ownership_type ADD VALUE IF NOT EXISTS 'owned'")
        op.execute("ALTER TYPE ownership_type ADD VALUE IF NOT EXISTS 'referred'")
        op.execute("ALTER TYPE referral_status ADD VALUE IF NOT EXISTS 'pending'")
        op.execute("ALTER TYPE referral_status ADD VALUE IF NOT EXISTS 'approved'")
        op.execute("ALTER TYPE referral_status ADD VALUE IF NOT EXISTS 'rejected'")

    # Normalize existing rows that were stored with the original uppercase labels.
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE business_referrals SET ownership_type = 'owned' WHERE ownership_type = 'OWNED'"))
    conn.execute(sa.text("UPDATE business_referrals SET ownership_type = 'referred' WHERE ownership_type = 'REFERRED'"))
    conn.execute(sa.text("UPDATE business_referrals SET status = 'pending' WHERE status = 'PENDING'"))
    conn.execute(sa.text("UPDATE business_referrals SET status = 'approved' WHERE status = 'APPROVED'"))
    conn.execute(sa.text("UPDATE business_referrals SET status = 'rejected' WHERE status = 'REJECTED'"))


def downgrade() -> None:
    # Reverse the data normalization (enum values cannot be removed from Postgres).
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE business_referrals SET ownership_type = 'OWNED' WHERE ownership_type = 'owned'"))
    conn.execute(sa.text("UPDATE business_referrals SET ownership_type = 'REFERRED' WHERE ownership_type = 'referred'"))
    conn.execute(sa.text("UPDATE business_referrals SET status = 'PENDING' WHERE status = 'pending'"))
    conn.execute(sa.text("UPDATE business_referrals SET status = 'APPROVED' WHERE status = 'approved'"))
    conn.execute(sa.text("UPDATE business_referrals SET status = 'REJECTED' WHERE status = 'rejected'"))
