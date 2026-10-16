from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class VoucherSequence(Base):
    """Voucher number counter per client per year (VCH-08)."""

    __tablename__ = "voucher_sequences"
    __table_args__ = (CheckConstraint("last_value > 0", name="ck_voucher_sequences_last_value_positive"),)

    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), primary_key=True)
    year = Column(Integer, primary_key=True)
    last_value = Column(Integer, nullable=False)
