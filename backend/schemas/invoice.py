from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from models.invoice import InvoiceStatus


class InvoiceItemResponse(BaseModel):
    id: str
    invoice_id: str
    line_no: int
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None


class InvoiceResponse(BaseModel):
    id: str
    request_id: str
    client_id: str
    client_name: Optional[str] = None
    uploaded_by: str
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    voucher_id: Optional[str] = None
    previous_request_id: Optional[str] = None
    request_type: str
    channel: str
    request_date: date
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    bank_account: Optional[str] = None
    tax_amount: Optional[float] = None
    discount_amount: float = 0
    total_amount: Optional[float] = None
    file_key: str
    original_filename: str
    mime_type: str
    status: str
    exception_codes: List[str] = Field(default_factory=list)
    reject_note: Optional[str] = None
    version: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[InvoiceItemResponse] = Field(default_factory=list)


class InvoiceApproveRequest(BaseModel):
    note: Optional[str] = None
    expected_version: Optional[int] = None


class InvoiceRejectRequest(BaseModel):
    reject_note: str = Field(min_length=1)
    expected_version: Optional[int] = None


class InvoiceCorrectRequest(BaseModel):
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    bank_account: Optional[str] = None
    tax_amount: Optional[float] = None
    discount_amount: Optional[float] = None
    total_amount: Optional[float] = None
    expected_version: Optional[int] = None


class AuditLogResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    user_id: str
    user_name: Optional[str] = None
    created_at: datetime


REVIEW_STATUS_VALUES = [
    InvoiceStatus.READY_FOR_REVIEW.value,
    InvoiceStatus.EXCEPTION.value,
    InvoiceStatus.POSSIBLE_DUPLICATE.value,
]
FINAL_STATUS_VALUES = [
    InvoiceStatus.AMIGA_REVIEWED.value,
    InvoiceStatus.REJECTED.value,
    InvoiceStatus.VOUCHERED.value,
    InvoiceStatus.SENT_TO_CLIENT.value,
]