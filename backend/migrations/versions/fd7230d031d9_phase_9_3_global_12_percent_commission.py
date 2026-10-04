"""phase 9.3 global 12 percent commission

The client's decision for Phase 9.3: Ovigo charges 12% on every sale, in every
channel (tours, custom tours, stays, rent-a-car, rides, guides). Rooms, vehicles
and rides were already at 12%; tours and custom-tour bids move from 10% to 12%,
and guide services get their first rule. PARTNER-scope overrides an admin set
for individual partners are untouched and still win.

Any running CATEGORY rule at another rate is ended yesterday (kept for history,
not deleted), and a 12% rule effective today is added for every item type that
doesn't already have a running 12% one. Commission rows are computed when a
booking's payment is confirmed, so existing rows keep the rate they were
created with.

Separate from a93ec511cd4e because Postgres can't use an enum value
(GUIDE_SERVICE) in the transaction that added it.

Revision ID: fd7230d031d9
Revises: a93ec511cd4e
Create Date: 2026-10-04 10:15:02.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'fd7230d031d9'
down_revision: Union[str, None] = 'a93ec511cd4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ITEM_TYPES = ("TOUR_DEPARTURE", "ROOM_TYPE", "CUSTOM_BID", "VEHICLE_RENTAL", "RIDE_BID", "GUIDE_SERVICE")


def upgrade() -> None:
    op.execute("""
        UPDATE commission_rules
        SET expiry_date = CURRENT_DATE - 1, updated_at = now()
        WHERE scope = 'CATEGORY' AND is_active AND rate <> 0.12
          AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    """)
    values = ", ".join(f"('{t}')" for t in ITEM_TYPES)
    op.execute(f"""
        INSERT INTO commission_rules
            (id, scope, item_type, partner_role_id, rate, is_active, effective_date, expiry_date, created_at, updated_at)
        SELECT gen_random_uuid(), 'CATEGORY', t.item_type::booking_item_type, NULL, 0.12, true, CURRENT_DATE, NULL, now(), now()
        FROM (VALUES {values}) AS t(item_type)
        WHERE NOT EXISTS (
            SELECT 1 FROM commission_rules r
            WHERE r.scope = 'CATEGORY' AND r.item_type = t.item_type::booking_item_type
              AND r.is_active AND r.rate = 0.12
              AND (r.effective_date IS NULL OR r.effective_date <= CURRENT_DATE)
              AND (r.expiry_date IS NULL OR r.expiry_date >= CURRENT_DATE)
        )
    """)


def downgrade() -> None:
    # Rates are business data, changed by admins in the commission-rules screen; a
    # schema downgrade doesn't guess which earlier rate to restore.
    pass
