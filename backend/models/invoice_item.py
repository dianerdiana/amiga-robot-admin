import uuid

from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    __table_args__ = (
        CheckConstraint("line_no > 0", name="ck_invoice_items_line_no_positive"),
        UniqueConstraint("invoice_id", "line_no", name="uq_invoice_items_invoice_line"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), index=True, nullable=False)
    line_no = Column(Integer, nullable=False)
    description = Column(String(1000), nullable=True)
    quantity = Column(Numeric(18, 4), nullable=True)
    unit_price = Column(Numeric(18, 2), nullable=True)
    amount = Column(Numeric(18, 2), nullable=True)
