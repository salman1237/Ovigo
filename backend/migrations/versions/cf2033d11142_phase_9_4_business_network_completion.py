"""phase_9_4_business_network_completion

Adds:
  1. Three new OwnershipType values: MANAGED, PARTNER, UNVERIFIED_RECOMMENDATION
     (ALTER TYPE ... ADD VALUE — must run outside a transaction, hence autocommit_block)
  2. A new `business_type_enum` Postgres enum (12 PRD §12.1 types + OTHER)
  3. `business_type_note` column to preserve original free text
  4. Data migration: maps existing free-text `business_type` values to the closest enum
     member (case-insensitive prefix match); anything unrecognised becomes OTHER with the
     original text saved to `business_type_note`.
  5. ALTER COLUMN `business_type` from VARCHAR(100) → business_type_enum (USING cast).

Revision ID: cf2033d11142
Revises: b3f1a72d9e45
Create Date: 2026-10-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "cf2033d11142"
down_revision: Union[str, None] = "b3f1a72d9e45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All 13 enum members (order matches the Python enum)
BUSINESS_TYPE_VALUES = [
    "hotel", "resort", "homestay", "guesthouse", "restaurant",
    "local_transport", "rent_a_car", "activity_provider", "photographer",
    "local_product_brand", "equipment_rental", "event_cultural", "other",
]

# Simple prefix/keyword → enum value mapping for the data migration
_KEYWORD_MAP = [
    ("hotel",        "hotel"),
    ("resort",       "resort"),
    ("homestay",     "homestay"),
    ("home stay",    "homestay"),
    ("guesthouse",   "guesthouse"),
    ("guest house",  "guesthouse"),
    ("restaurant",   "restaurant"),
    ("food",         "restaurant"),
    ("local transport", "local_transport"),
    ("transport",    "local_transport"),
    ("rent",         "rent_a_car"),
    ("car",          "rent_a_car"),
    ("activity",     "activity_provider"),
    ("photo",        "photographer"),
    ("product",      "local_product_brand"),
    ("equipment",    "equipment_rental"),
    ("event",        "event_cultural"),
    ("cultural",     "event_cultural"),
]


def upgrade() -> None:
    # ── Step 1: Add three new OwnershipType values (cannot run in a transaction) ──
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE ownership_type ADD VALUE IF NOT EXISTS 'managed'")
        op.execute("ALTER TYPE ownership_type ADD VALUE IF NOT EXISTS 'partner'")
        op.execute(
            "ALTER TYPE ownership_type ADD VALUE IF NOT EXISTS 'unverified_recommendation'"
        )

    # ── Step 2: Create the new business_type_enum Postgres type ──
    business_type_enum = postgresql.ENUM(*BUSINESS_TYPE_VALUES, name="business_type_enum")
    business_type_enum.create(op.get_bind())

    # ── Step 3: Add business_type_note column ──
    op.add_column(
        "business_referrals",
        sa.Column("business_type_note", sa.String(200), nullable=True),
    )

    # ── Step 4: Data migration — map free text → enum; store original in note ──
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, business_type FROM business_referrals")
    ).fetchall()

    for row_id, raw in rows:
        lower = (raw or "").strip().lower()
        mapped = "other"
        for keyword, value in _KEYWORD_MAP:
            if keyword in lower:
                mapped = value
                break
        note = raw if mapped == "other" else None
        conn.execute(
            sa.text(
                "UPDATE business_referrals SET business_type = :mapped, business_type_note = :note "
                "WHERE id = :id"
            ),
            {"mapped": mapped, "note": note, "id": row_id},
        )

    # ── Step 5: Change column type from VARCHAR → business_type_enum ──
    op.alter_column(
        "business_referrals",
        "business_type",
        existing_type=sa.VARCHAR(length=100),
        type_=postgresql.ENUM(*BUSINESS_TYPE_VALUES, name="business_type_enum", create_type=False),
        existing_nullable=False,
        postgresql_using="business_type::business_type_enum",
    )


def downgrade() -> None:
    # Revert column back to VARCHAR (loses enum enforcement, keeps text)
    op.alter_column(
        "business_referrals",
        "business_type",
        existing_type=postgresql.ENUM(*BUSINESS_TYPE_VALUES, name="business_type_enum", create_type=False),
        type_=sa.VARCHAR(length=100),
        existing_nullable=False,
    )
    op.drop_column("business_referrals", "business_type_note")

    conn = op.get_bind()
    conn.execute(sa.text("DROP TYPE IF EXISTS business_type_enum"))

    # Cannot remove enum values in Postgres — ownership_type new values stay
