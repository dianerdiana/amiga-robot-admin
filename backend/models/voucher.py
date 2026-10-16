import uuid
from enum import Enum

from sqlalchemy import CheckConstraint, Column, DateTime, Enum as SQLEnum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class VoucherStatus(str, Enum):
    CREATED = "CREATED"
    SENT_TO_CLIENT = "SENT_TO_CLIENT"


class Voucher(Base):
    __tablename__ = "vouchers"
    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="ck_vouchers_total_amount_nonnegative"),
        CheckConstraint(
            "(status = 'CREATED' AND sent_at IS NULL) OR "
            "(status = 'SENT_TO_CLIENT' AND sent_at IS NOT NULL)",
            name="ck_vouchers_sent_at_matches_status",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    voucher_number = Column(String(50), unique=True, index=True, nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), index=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    vendor_name = Column(String(255), nullable=False)
    bank_account = Column(String(100), nullable=False)
    purpose = Column(String(255), nullable=False)
    total_amount = Column(Numeric(18, 2), nullable=False)
    file_key = Column(String(1024), nullable=False)
    status = Column(SQLEnum(VoucherStatus, name="voucher_status"), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    client = relationship("Client")
    creator = relationship("User", foreign_keys=[created_by])
    invoices = relationship("Invoice", back_populates="voucher", order_by="Invoice.created_at")
