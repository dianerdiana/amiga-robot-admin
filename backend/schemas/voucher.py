import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

from models.invoice import InvoiceStatus
from models.voucher import VoucherStatus
from schemas.invoice import ClientRef, InvoiceItemResponse, UserRef


PURPOSE_MAX_LENGTH = 255
MAX_VOUCHER_INVOICES = 100


class VoucherVendor(BaseModel):
    """Vendor option for the Buat Voucher form (VCH-01), grouped by normalized name."""

    key: str
    name: str
    invoice_count: int


class EligibleInvoice(BaseModel):
    """AMIGA_REVIEWED invoice without a voucher (VCH-02)."""

    id: uuid.UUID
    request_id: str
    vendor_name: str | None
    invoice_number: str | None
    invoice_date: date | None
    bank_account: str | None
    # Digits only; rows whose key differs from the first selected row are disabled (VCH-03).
    bank_key: str
    tax_amount: Decimal | None
    discount_amount: Decimal
    total_amount: Decimal | None
    item_count: int
    original_filename: str
    mime_type: str


class VoucherCreate(BaseModel):
    client_id: uuid.UUID
    invoice_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_VOUCHER_INVOICES)
    # Validated even when omitted, so a missing purpose yields the Indonesian 422 message.
    purpose: str = Field(default="", validate_default=True)

    @field_validator("invoice_ids")
    @classmethod
    def _unique(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(value)) != len(value):
            raise PydanticCustomError("invalid_value", "Invoice yang sama dipilih lebih dari sekali.")
        return value

    @field_validator("purpose", mode="before")
    @classmethod
    def _purpose(cls, value: object) -> str:
        text = " ".join(str(value or "").split())
        if not text:
            raise PydanticCustomError("invalid_value", "Peruntukan wajib diisi.")
        if len(text) > PURPOSE_MAX_LENGTH:
            raise PydanticCustomError("invalid_value", f"Peruntukan maksimal {PURPOSE_MAX_LENGTH} karakter.")
        return text


class VoucherInvoiceRef(BaseModel):
    """Invoice inside a voucher, with its line items for the detail view (UC-10 step 3)."""

    id: uuid.UUID
    request_id: str
    invoice_number: str | None
    invoice_date: date | None
    status: InvoiceStatus
    tax_amount: Decimal | None
    discount_amount: Decimal
    total_amount: Decimal | None
    items: list[InvoiceItemResponse]


class VoucherDetail(BaseModel):
    id: uuid.UUID
    voucher_number: str
    client: ClientRef
    vendor_name: str
    bank_account: str
    purpose: str
    total_amount: Decimal
    status: VoucherStatus
    created_by: UserRef
    created_at: datetime
    sent_at: datetime | None
    invoices: list[VoucherInvoiceRef]


class VoucherSummary(BaseModel):
    """Row of the voucher list (UC-10)."""

    id: uuid.UUID
    voucher_number: str
    client: ClientRef
    vendor_name: str
    purpose: str
    total_amount: Decimal
    status: VoucherStatus
    created_at: datetime
    invoice_count: int


class VoucherPage(BaseModel):
    items: list[VoucherSummary]
    total: int
    skip: int
    limit: int


class VoucherDownload(BaseModel):
    """Short-lived download link (VCH-11) plus the voucher after any status change (VCH-12)."""

    url: str
    expires_in: int
    filename: str
    first_download: bool
    voucher: VoucherDetail
