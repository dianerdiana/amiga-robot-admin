"""add invoice extraction fields, request id sequence, and robot admin user

Revision ID: c5a1d8e3f702
Revises: b4e7f2a91c03
Create Date: 2026-10-15

Downgrade note: the Robot Admin user can only be deleted while no audit_logs rows
reference it. Because audit_logs is append-only (AUD-03), downgrading after the
extraction worker has run fails with a foreign key violation.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c5a1d8e3f702"
down_revision: Union[str, Sequence[str], None] = "b4e7f2a91c03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROBOT_ADMIN_EMAIL = "robot@amiga.system"


def upgrade() -> None:
    op.add_column("invoices", sa.Column("file_size", sa.BigInteger(), nullable=True))
    # Raw AI extraction output is kept as a traceable draft (EXT-02).
    op.add_column("invoices", sa.Column("extraction_result", postgresql.JSONB(), nullable=True))
    op.add_column("invoices", sa.Column("extraction_error", sa.Text(), nullable=True))
    op.add_column(
        "invoices",
        sa.Column("extraction_attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column("invoices", sa.Column("extraction_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("invoices", sa.Column("extracted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "invoices",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_check_constraint(
        "ck_invoices_extraction_attempts_nonnegative",
        "invoices",
        "extraction_attempts >= 0",
    )

    # The worker claims the oldest QUEUED invoice; the partial index keeps claims fast.
    op.create_index(
        "ix_invoices_queued",
        "invoices",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("status = 'QUEUED'"),
    )

    # Sequence behind Request IDs REQ-{year}-{6 digits} (PRD 5.2).
    op.execute(sa.schema.CreateSequence(sa.Sequence("invoice_request_seq")))

    # AUD-02: system changes are audited under the Robot Admin account.
    # A NULL password_hash means this account can never log in.
    op.execute(
        sa.text(
            "INSERT INTO users (name, email, password_hash, role, is_active) "
            "VALUES ('AMIGA Robot', :email, NULL, 'ROBOT_ADMIN', true) "
            "ON CONFLICT (email) DO NOTHING"
        ).bindparams(email=ROBOT_ADMIN_EMAIL)
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM users WHERE email = :email").bindparams(email=ROBOT_ADMIN_EMAIL))
    op.execute(sa.schema.DropSequence(sa.Sequence("invoice_request_seq")))
    op.drop_index("ix_invoices_queued", table_name="invoices", postgresql_where=sa.text("status = 'QUEUED'"))
    op.drop_constraint("ck_invoices_extraction_attempts_nonnegative", "invoices", type_="check")
    op.drop_column("invoices", "updated_at")
    op.drop_column("invoices", "extracted_at")
    op.drop_column("invoices", "extraction_started_at")
    op.drop_column("invoices", "extraction_attempts")
    op.drop_column("invoices", "extraction_error")
    op.drop_column("invoices", "extraction_result")
    op.drop_column("invoices", "file_size")
