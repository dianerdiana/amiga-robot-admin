import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict

from models.invoice import InvoiceStatus
from services.extraction.schema import ExtractedInvoice


DEFAULT_REQUEST_TYPE = "Pembayaran Vendor"


class InvoiceChannel(str, Enum):
    WHATSAPP = "WhatsApp"
    EMAIL = "Email"
    LAINNYA = "Lainnya"


class ClientRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str


class UserRef(BaseModel):
    id: uuid.UUID
    name: str
    is_system: bool = False


class AssignedClient(ClientRef):
    has_reviewer: bool


class InvoiceUploadResponse(BaseModel):
    id: uuid.UUID
    request_id: str
    status: InvoiceStatus
    client: ClientRef
    has_reviewer: bool
    original_filename: str
    file_size: int
    mime_type: str
    channel: str
    request_type: str
    request_date: date
    uploaded_by: UserRef
    created_at: datetime


class ExceptionFinding(BaseModel):
    code: str
    message: str


class InvoiceSummary(BaseModel):
    id: uuid.UUID
    request_id: str
    client: ClientRef
    vendor_name: str | None
    invoice_number: str | None
    total_amount: Decimal | None
    status: InvoiceStatus
    request_date: date
    created_at: datetime
    exception_codes: list[str]
    has_reviewer: bool
    version: int


class InvoicePage(BaseModel):
    items: list[InvoiceSummary]
    total: int
    skip: int
    limit: int


class InvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    line_no: int
    description: str | None
    quantity: Decimal | None
    unit_price: Decimal | None
    amount: Decimal | None


class InvoiceDecision(BaseModel):
    status: InvoiceStatus
    reviewer: UserRef | None
    decided_at: datetime | None
    reject_note: str | None


class PreviousRequestRef(BaseModel):
    id: uuid.UUID
    request_id: str
    status: InvoiceStatus
    reject_note: str | None


class InvoiceDetail(InvoiceSummary):
    request_type: str
    channel: str
    invoice_date: date | None
    bank_account: str | None
    tax_amount: Decimal | None
    discount_amount: Decimal
    subtotal_amount: Decimal | None
    items: list[InvoiceItemResponse]
    exceptions: list[ExceptionFinding]
    original_filename: str
    file_size: int | None
    mime_type: str
    uploaded_by: UserRef
    extracted_at: datetime | None
    is_draft: bool
    decision: InvoiceDecision | None
    previous_request: PreviousRequestRef | None
    version: int


class ExtractionStatus(BaseModel):
    invoice_id: uuid.UUID
    request_id: str
    status: InvoiceStatus
    attempts: int
    started_at: datetime | None
    extracted_at: datetime | None
    error: str | None
    exceptions: list[ExceptionFinding]
    result: ExtractedInvoice | None


class FileUrlResponse(BaseModel):
    url: str
    expires_in: int
    mime_type: str
    original_filename: str
    file_size: int | None


class AuditEntry(BaseModel):
    id: uuid.UUID
    created_at: datetime
    user: UserRef
    action: str
    field_name: str | None
    old_value: str | None
    new_value: str | None
