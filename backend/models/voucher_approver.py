import uuid

from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class VoucherApprover(Base):
    """A "Disetujui oleh" signer on the voucher PDF, typed in by hand (may be outside the system)."""

    __tablename__ = "voucher_approvers"
    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_voucher_approvers_position_nonnegative"),
        UniqueConstraint("voucher_id", "position", name="uq_voucher_approvers_voucher_position"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    voucher_id = Column(UUID(as_uuid=True), ForeignKey("vouchers.id", ondelete="CASCADE"), index=True, nullable=False)
    position = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(100), nullable=False)
