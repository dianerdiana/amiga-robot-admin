"""add voucher_sequences for per-client, per-year voucher numbering

Revision ID: e7c3a9b5d104
Revises: c5a1d8e3f702
Create Date: 2026-10-16

VCH-08: voucher numbers are VCH-{client code}-{year}-{5 digits}, counted per client per year.
A single Postgres sequence cannot reset per client and year, so a counter row is kept per
(client_id, year) and incremented with an upsert inside the voucher transaction.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e7c3a9b5d104"
down_revision: Union[str, Sequence[str], None] = "c5a1d8e3f702"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voucher_sequences",
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("last_value", sa.Integer(), nullable=False),
        sa.CheckConstraint("last_value > 0", name="ck_voucher_sequences_last_value_positive"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("client_id", "year"),
    )


def downgrade() -> None:
    op.drop_table("voucher_sequences")
