import uuid
from enum import Enum

from sqlalchemy import BigInteger, CheckConstraint, Column, Date, DateTime, Enum as SQLEnum, ForeignKey, Index, Integer, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import relationship

from database import Base


class InvoiceStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    EXCEPTION = "EXCEPTION"
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE"
    AMIGA_REVIEWED = "AMIGA_REVIEWED"
    REJECTED = "REJECTED"
    VOUCHERED = "VOUCHERED"
    SENT_TO_CLIENT = "SENT_TO_CLIENT"


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_invoices_version_positive"),
        CheckConstraint("discount_amount >= 0", name="ck_invoices_discount_nonnegative"),
        CheckConstraint(
            "status <> 'REJECTED' OR (reject_note IS NOT NULL AND length(trim(reject_note)) > 0)",
            name="ck_invoices_rejected_has_note",
        ),
        CheckConstraint(
            "status NOT IN ('AMIGA_REVIEWED', 'REJECTED', 'VOUCHERED', 'SENT_TO_CLIENT') "
            "OR reviewed_by IS NOT NULL",
            name="ck_invoices_decision_has_reviewer",
        ),
        CheckConstraint(
            "status NOT IN ('VOUCHERED', 'SENT_TO_CLIENT') OR voucher_id IS NOT NULL",
            name="ck_invoices_voucher_status_has_voucher",
        ),
        CheckConstraint(
            "reviewed_by IS NULL OR reviewed_by <> uploaded_by",
            name="ck_invoices_reviewer_not_uploader",
        ),
        CheckConstraint("extraction_attempts >= 0", name="ck_invoices_extraction_attempts_nonnegative"),
        Index("ix_invoices_duplicate_detection", "client_id", "vendor_name", "invoice_number"),
        Index("ix_invoices_queued", "created_at", postgresql_where=text("status = 'QUEUED'")),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    request_id = Column(String(100), unique=True, index=True, nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), index=True, nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    voucher_id = Column(UUID(as_uuid=True), ForeignKey("vouchers.id", ondelete="RESTRICT"), index=True, nullable=True)
    previous_request_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True)
    request_type = Column(String(100), nullable=False)
    channel = Column(String(50), nullable=False)
    request_date = Column(Date, nullable=False)
    vendor_name = Column(String(255), nullable=True)
    invoice_number = Column(String(255), nullable=True)
    invoice_date = Column(Date, nullable=True)
    bank_account = Column(String(100), nullable=True)
    tax_amount = Column(Numeric(18, 2), nullable=True)
    discount_amount = Column(Numeric(18, 2), server_default=text("0"), nullable=False)
    total_amount = Column(Numeric(18, 2), nullable=True)
    file_key = Column(String(1024), nullable=False)
    original_filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    status = Column(SQLEnum(InvoiceStatus, name="invoice_status"), index=True, nullable=False)
    exception_codes = Column(ARRAY(String(100)), server_default=text("'{}'::varchar[]"), nullable=False)
    reject_note = Column(Text, nullable=True)
    version = Column(Integer, server_default=text("1"), nullable=False)
    file_size = Column(BigInteger, nullable=True)
    extraction_result = Column(JSONB, nullable=True)
    extraction_error = Column(Text, nullable=True)
    extraction_attempts = Column(Integer, server_default=text("0"), nullable=False)
    extraction_started_at = Column(DateTime(timezone=True), nullable=True)
    extracted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    items = relationship(
        "InvoiceItem",
        back_populates="invoice",
        order_by="InvoiceItem.line_no",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    client = relationship("Client")
    uploader = relationship("User", foreign_keys=[uploaded_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    previous_request = relationship("Invoice", remote_side=[id])
    voucher = relationship("Voucher", back_populates="invoices")
