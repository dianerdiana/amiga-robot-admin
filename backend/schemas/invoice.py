import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

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
    can_edit: bool
    # Finance Reviewer decision flags (UC-8); always false for Intake and for the uploader (SoD).
    can_approve: bool
    can_reject: bool
    approve_requires_note: bool
    last_correction: "CorrectionNote | None"


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


class CorrectionNote(BaseModel):
    by: UserRef
    at: datetime
    reason: str


# ----------------------------------------------------------------------
# Intake data correction. These validators are the primary input rules;
# the frontend only mirrors simple checks for faster feedback.
# ----------------------------------------------------------------------
MAX_CORRECTION_ITEMS = 200
REASON_MIN_LENGTH = 10
REASON_MAX_LENGTH = 500


def _invalid(message: str) -> PydanticCustomError:
    return PydanticCustomError("invalid_value", message)


def _clean_text(value: object, max_length: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise _invalid("Nilai harus berupa teks.")
    text = " ".join(value.split())
    if len(text) > max_length:
        raise _invalid(f"Maksimal {max_length} karakter.")
    return text or None


def _clean_amount(value: object, *, max_digits: int = 18, decimal_places: int = 2) -> Decimal | None:
    """Non-negative decimal that fits the Numeric(max_digits, decimal_places) column."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        raise _invalid("Nilai harus berupa angka.")
    try:
        amount = Decimal(str(value).strip())
    except InvalidOperation:
        raise _invalid("Nilai harus berupa angka.")
    if not amount.is_finite():
        raise _invalid("Nilai harus berupa angka.")
    if amount < 0:
        raise _invalid("Nilai tidak boleh negatif.")
    exponent = amount.as_tuple().exponent
    if isinstance(exponent, int) and -exponent > decimal_places:
        raise _invalid(f"Maksimal {decimal_places} angka di belakang koma.")
    if amount >= Decimal(10) ** (max_digits - decimal_places):
        raise _invalid("Nilai terlalu besar.")
    return amount


class InvoiceItemInput(BaseModel):
    description: str | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    amount: Decimal | None = None

    @field_validator("description", mode="before")
    @classmethod
    def _description(cls, value: object) -> str | None:
        return _clean_text(value, 1000)

    @field_validator("quantity", mode="before")
    @classmethod
    def _quantity(cls, value: object) -> Decimal | None:
        return _clean_amount(value, decimal_places=4)

    @field_validator("unit_price", "amount", mode="before")
    @classmethod
    def _money(cls, value: object) -> Decimal | None:
        return _clean_amount(value)

    @model_validator(mode="after")
    def _not_empty(self) -> "InvoiceItemInput":
        if all(v is None for v in (self.description, self.quantity, self.unit_price, self.amount)):
            raise _invalid("Baris kosong; hapus atau lengkapi baris ini.")
        return self


class InvoiceCorrection(BaseModel):
    version: int = Field(ge=1)
    # Validated even when omitted, so a missing reason yields the Indonesian 422 message.
    reason: str = Field(default="", validate_default=True)
    vendor_name: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    bank_account: str | None = None
    tax_amount: Decimal | None = None
    discount_amount: Decimal = Decimal("0")
    total_amount: Decimal | None = None
    items: list[InvoiceItemInput] = Field(default_factory=list)

    @field_validator("reason", mode="before")
    @classmethod
    def _reason(cls, value: object) -> str:
        text = " ".join(str(value or "").split())
        if len(text) < REASON_MIN_LENGTH:
            raise _invalid(f"Alasan koreksi wajib diisi (min. {REASON_MIN_LENGTH} karakter).")
        if len(text) > REASON_MAX_LENGTH:
            raise _invalid(f"Alasan koreksi maksimal {REASON_MAX_LENGTH} karakter.")
        return text

    @field_validator("vendor_name", "invoice_number", mode="before")
    @classmethod
    def _short_text(cls, value: object) -> str | None:
        return _clean_text(value, 255)

    @field_validator("bank_account", mode="before")
    @classmethod
    def _bank_account(cls, value: object) -> str | None:
        return _clean_text(value, 100)

    @field_validator("invoice_date", mode="before")
    @classmethod
    def _date(cls, value: object) -> date | None:
        if value is None or value == "":
            return None
        if isinstance(value, date):
            parsed = value
        else:
            try:
                parsed = date.fromisoformat(str(value))
            except ValueError:
                raise _invalid("Format tanggal tidak valid (YYYY-MM-DD).")
        if parsed > date.today():
            raise _invalid("Tanggal invoice tidak boleh di masa depan.")
        return parsed

    @field_validator("tax_amount", "total_amount", mode="before")
    @classmethod
    def _optional_money(cls, value: object) -> Decimal | None:
        return _clean_amount(value)

    @field_validator("discount_amount", mode="before")
    @classmethod
    def _discount(cls, value: object) -> Decimal:
        amount = _clean_amount(value)
        return amount if amount is not None else Decimal("0")

    @field_validator("items", mode="before")
    @classmethod
    def _items_limit(cls, value: object) -> object:
        if isinstance(value, list) and len(value) > MAX_CORRECTION_ITEMS:
            raise _invalid(f"Maksimal {MAX_CORRECTION_ITEMS} baris barang.")
        return value


def _decision_note(value: object, label: str, *, required: bool) -> str | None:
    """Reviewer note: whitespace collapsed, 10 to 500 characters; empty is allowed only when optional."""
    text = " ".join(str(value or "").split())
    if not text and not required:
        return None
    if len(text) < REASON_MIN_LENGTH:
        raise _invalid(f"{label} wajib diisi (min. {REASON_MIN_LENGTH} karakter).")
    if len(text) > REASON_MAX_LENGTH:
        raise _invalid(f"{label} maksimal {REASON_MAX_LENGTH} karakter.")
    return text


APPROVAL_NOTE_LABEL = "Catatan justifikasi"


class InvoiceApproval(BaseModel):
    version: int = Field(ge=1)
    # Optional here; the service requires it when approving a POSSIBLE_DUPLICATE.
    note: str | None = None

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, value: object) -> str | None:
        return _decision_note(value, APPROVAL_NOTE_LABEL, required=False)


class InvoiceRejection(BaseModel):
    version: int = Field(ge=1)
    note: str = Field(default="", validate_default=True)

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, value: object) -> str:
        return _decision_note(value, "Catatan penolakan", required=True)


InvoiceDetail.model_rebuild()
