"""create invoice, voucher, assignment, and audit tables

Revision ID: b4e7f2a91c03
Revises: 68f948e63d0d
Create Date: 2026-10-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b4e7f2a91c03"
down_revision: Union[str, Sequence[str], None] = "68f948e63d0d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


invoice_status = sa.Enum(
    "QUEUED",
    "PROCESSING",
    "READY_FOR_REVIEW",
    "EXCEPTION",
    "POSSIBLE_DUPLICATE",
    "AMIGA_REVIEWED",
    "REJECTED",
    "VOUCHERED",
    "SENT_TO_CLIENT",
    name="invoice_status",
)
voucher_status = sa.Enum("CREATED", "SENT_TO_CLIENT", name="voucher_status")


def upgrade() -> None:
    # Kode klien diperlukan untuk nomor VCH-{kode}-{tahun}-{urutan}.
    # Backfill menjaga migration tetap dapat dijalankan pada tabel clients berisi data.
    op.add_column("clients", sa.Column("code", sa.String(length=50), nullable=True))
    op.execute(
        "UPDATE clients SET code = 'CL-' || upper(substring(replace(id::text, '-', '') from 1 for 8)) "
        "WHERE code IS NULL"
    )
    op.alter_column("clients", "code", nullable=False)
    op.create_index(op.f("ix_clients_code"), "clients", ["code"], unique=True)

    op.create_table(
        "user_clients",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "client_id"),
    )

    op.create_table(
        "vouchers",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("voucher_number", sa.String(length=50), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vendor_name", sa.String(length=255), nullable=False),
        sa.Column("bank_account", sa.String(length=100), nullable=False),
        sa.Column("purpose", sa.String(length=255), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("file_key", sa.String(length=1024), nullable=False),
        sa.Column("status", voucher_status, nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("total_amount >= 0", name="ck_vouchers_total_amount_nonnegative"),
        sa.CheckConstraint(
            "(status = 'CREATED' AND sent_at IS NULL) OR "
            "(status = 'SENT_TO_CLIENT' AND sent_at IS NOT NULL)",
            name="ck_vouchers_sent_at_matches_status",
        ),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vouchers_client_id"), "vouchers", ["client_id"], unique=False)
    op.create_index(op.f("ix_vouchers_voucher_number"), "vouchers", ["voucher_number"], unique=True)

    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("request_id", sa.String(length=100), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("voucher_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("previous_request_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("request_type", sa.String(length=100), nullable=False),
        sa.Column("channel", sa.String(length=50), nullable=False),
        sa.Column("request_date", sa.Date(), nullable=False),
        sa.Column("vendor_name", sa.String(length=255), nullable=True),
        sa.Column("invoice_number", sa.String(length=255), nullable=True),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("bank_account", sa.String(length=100), nullable=True),
        sa.Column("tax_amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("discount_amount", sa.Numeric(precision=18, scale=2), server_default=sa.text("0"), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("file_key", sa.String(length=1024), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("status", invoice_status, nullable=False),
        sa.Column("exception_codes", postgresql.ARRAY(sa.String(length=100)), server_default=sa.text("'{}'::varchar[]"), nullable=False),
        sa.Column("reject_note", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("version >= 1", name="ck_invoices_version_positive"),
        sa.CheckConstraint("discount_amount >= 0", name="ck_invoices_discount_nonnegative"),
        sa.CheckConstraint(
            "status <> 'REJECTED' OR (reject_note IS NOT NULL AND length(trim(reject_note)) > 0)",
            name="ck_invoices_rejected_has_note",
        ),
        sa.CheckConstraint(
            "status NOT IN ('AMIGA_REVIEWED', 'REJECTED', 'VOUCHERED', 'SENT_TO_CLIENT') "
            "OR reviewed_by IS NOT NULL",
            name="ck_invoices_decision_has_reviewer",
        ),
        sa.CheckConstraint(
            "status NOT IN ('VOUCHERED', 'SENT_TO_CLIENT') OR voucher_id IS NOT NULL",
            name="ck_invoices_voucher_status_has_voucher",
        ),
        sa.CheckConstraint(
            "reviewed_by IS NULL OR reviewed_by <> uploaded_by",
            name="ck_invoices_reviewer_not_uploader",
        ),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["previous_request_id"], ["invoices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_invoices_client_id"), "invoices", ["client_id"], unique=False)
    op.create_index(op.f("ix_invoices_request_id"), "invoices", ["request_id"], unique=True)
    op.create_index(op.f("ix_invoices_status"), "invoices", ["status"], unique=False)
    op.create_index(op.f("ix_invoices_voucher_id"), "invoices", ["voucher_id"], unique=False)
    op.create_index(
        "ix_invoices_duplicate_detection",
        "invoices",
        ["client_id", "vendor_name", "invoice_number"],
        unique=False,
    )

    op.create_table(
        "invoice_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("quantity", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("unit_price", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.CheckConstraint("line_no > 0", name="ck_invoice_items_line_no_positive"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_id", "line_no", name="uq_invoice_items_invoice_line"),
    )
    op.create_index(op.f("ix_invoice_items_invoice_id"), "invoice_items", ["invoice_id"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("entity_type", sa.String(length=100), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("field_name", sa.String(length=255), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_entity_id"), "audit_logs", ["entity_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_entity_type"), "audit_logs", ["entity_type"], unique=False)
    op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"], unique=False)
    op.create_index("ix_audit_logs_entity_created_at", "audit_logs", ["entity_type", "entity_id", "created_at"], unique=False)

    # AUD-03: audit log bersifat append-only, termasuk bagi System Admin aplikasi.
    op.execute(
        """
        CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs is append-only';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_audit_logs_append_only
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_mutation()")
    op.drop_index("ix_audit_logs_entity_created_at", table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_user_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_entity_type"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_entity_id"), table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index(op.f("ix_invoice_items_invoice_id"), table_name="invoice_items")
    op.drop_table("invoice_items")
    op.drop_index("ix_invoices_duplicate_detection", table_name="invoices")
    op.drop_index(op.f("ix_invoices_voucher_id"), table_name="invoices")
    op.drop_index(op.f("ix_invoices_status"), table_name="invoices")
    op.drop_index(op.f("ix_invoices_request_id"), table_name="invoices")
    op.drop_index(op.f("ix_invoices_client_id"), table_name="invoices")
    op.drop_table("invoices")
    op.drop_index(op.f("ix_vouchers_voucher_number"), table_name="vouchers")
    op.drop_index(op.f("ix_vouchers_client_id"), table_name="vouchers")
    op.drop_table("vouchers")
    op.drop_table("user_clients")
    op.drop_index(op.f("ix_clients_code"), table_name="clients")
    op.drop_column("clients", "code")
    invoice_status.drop(op.get_bind(), checkfirst=True)
    voucher_status.drop(op.get_bind(), checkfirst=True)
