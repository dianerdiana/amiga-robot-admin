"""add voucher signers (submitter snapshot and approvers)

Revision ID: a3d6f1c8e925
Revises: f8a7b6c5d4e3
Create Date: 2026-10-16

The voucher PDF ends with a signature section: "Diajukan oleh" (the creator, with an editable
role) and one or more "Disetujui oleh" entries typed in by hand, since approvers can be people
outside the system. Both are snapshotted so the stored PDF and the detail view stay in sync.
The submitter columns are nullable because vouchers created before this have no signatures.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a3d6f1c8e925"
down_revision: Union[str, Sequence[str], None] = "f8a7b6c5d4e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vouchers", sa.Column("submitter_name", sa.String(length=255), nullable=True))
    op.add_column("vouchers", sa.Column("submitter_role", sa.String(length=100), nullable=True))
    op.create_table(
        "voucher_approvers",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("voucher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=100), nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_voucher_approvers_position_nonnegative"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("voucher_id", "position", name="uq_voucher_approvers_voucher_position"),
    )
    op.create_index(op.f("ix_voucher_approvers_voucher_id"), "voucher_approvers", ["voucher_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_voucher_approvers_voucher_id"), table_name="voucher_approvers")
    op.drop_table("voucher_approvers")
    op.drop_column("vouchers", "submitter_role")
    op.drop_column("vouchers", "submitter_name")
