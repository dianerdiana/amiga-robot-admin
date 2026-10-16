"""Automatic invoice validation by Robot Admin (UC-3, VAL-01 to VAL-06)."""

import re
import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.config import settings
from models.invoice import Invoice, InvoiceStatus
from services.audit_service import AuditService


MISSING_EVIDENCE = "MISSING_EVIDENCE"
TOTAL_MISMATCH = "TOTAL_MISMATCH"
NO_LINE_ITEMS = "NO_LINE_ITEMS"
EXTRACTION_FAILED = "EXTRACTION_FAILED"
UNREADABLE_DOCUMENT = "UNREADABLE_DOCUMENT"
POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE"

EXTRACTION_FAILURE_CODES = (EXTRACTION_FAILED, UNREADABLE_DOCUMENT)

# VAL-06: cause and action message per code (user-facing, in Indonesian).
EXCEPTION_MESSAGES = {
    MISSING_EVIDENCE: "Nomor rekening tidak ditemukan pada invoice.",
    TOTAL_MISMATCH: "Total invoice tidak sama dengan jumlah baris, diskon, dan pajak (selisih {difference}).",
    NO_LINE_ITEMS: "Baris barang tidak ditemukan.",
    EXTRACTION_FAILED: "Ekstraksi otomatis gagal. Isi data secara manual atau tolak dokumen.",
    UNREADABLE_DOCUMENT: "Dokumen tidak terbaca jelas.",
    # POSSIBLE_DUPLICATE is a warning: the data can be corrected and the reviewer may still approve manually.
    POSSIBLE_DUPLICATE: (
        "Invoice dengan nomor dan vendor yang sama sudah ada (Request ID {request_id}). "
        "Periksa kembali; reviewer dapat menolak atau menyetujui secara manual."
    ),
}

_NON_ALNUM_SQL = "[^[:alnum:]]+"


def normalize_key(value: str | None) -> str:
    """Lowercase, with spaces and punctuation removed (VAL-04)."""
    return re.sub(r"[\W_]+", "", (value or "").lower())


def normalize_bank_account(value: str | None) -> str:
    """Bank accounts are normalized to digits only (UC-3 business rule)."""
    return re.sub(r"\D", "", value or "")


def format_rupiah(value: Decimal | None) -> str:
    """Format IDR as Rp1.250.000,00 per the usability NFR."""
    if value is None:
        return "-"
    sign = "-" if value < 0 else ""
    integer, fraction = f"{abs(value):,.2f}".split(".")
    return f"{sign}Rp{integer.replace(',', '.')},{fraction}"


def total_difference(invoice: Invoice) -> Decimal | None:
    """Difference of (line sum - discount + tax) against the total; None when the total is empty."""
    if invoice.total_amount is None:
        return None
    lines = sum((item.amount or Decimal("0") for item in invoice.items), Decimal("0"))
    expected = lines - (invoice.discount_amount or Decimal("0")) + (invoice.tax_amount or Decimal("0"))
    return expected - invoice.total_amount


def find_duplicate(db: Session, invoice: Invoice) -> Invoice | None:
    """Another invoice of the same client with the same normalized vendor and number.

    REJECTED invoices and the invoice itself are ignored (VAL-04).
    """
    vendor_key = normalize_key(invoice.vendor_name)
    number_key = normalize_key(invoice.invoice_number)
    if not vendor_key or not number_key:
        return None
    return (
        db.query(Invoice)
        .filter(
            Invoice.client_id == invoice.client_id,
            Invoice.id != invoice.id,
            Invoice.status != InvoiceStatus.REJECTED,
            func.lower(func.regexp_replace(Invoice.vendor_name, _NON_ALNUM_SQL, "", "g")) == vendor_key,
            func.lower(func.regexp_replace(Invoice.invoice_number, _NON_ALNUM_SQL, "", "g")) == number_key,
        )
        .order_by(Invoice.created_at)
        .first()
    )


def validate(db: Session, invoice: Invoice) -> list[str]:
    """Run every VAL rule and return the list of finding codes."""
    codes: list[str] = []
    if not normalize_bank_account(invoice.bank_account):
        codes.append(MISSING_EVIDENCE)
    if not invoice.items:
        codes.append(NO_LINE_ITEMS)
    else:
        difference = total_difference(invoice)
        tolerance = Decimal(settings.TOTAL_TOLERANCE)
        if difference is None or abs(difference) > tolerance:
            codes.append(TOTAL_MISMATCH)
    if find_duplicate(db, invoice) is not None:
        codes.append(POSSIBLE_DUPLICATE)
    return codes


def resolve_status(codes: list[str]) -> InvoiceStatus:
    """POSSIBLE_DUPLICATE beats EXCEPTION, which beats READY_FOR_REVIEW (VAL-05)."""
    if POSSIBLE_DUPLICATE in codes:
        return InvoiceStatus.POSSIBLE_DUPLICATE
    if codes:
        return InvoiceStatus.EXCEPTION
    return InvoiceStatus.READY_FOR_REVIEW


def apply_result(db: Session, invoice: Invoice, codes: list[str], actor_id: uuid.UUID) -> None:
    """Store findings and status, bump version, and write audit entries (UC-3 steps 5 to 7).

    Does not commit; the caller saves this together with its data changes.
    """
    old_codes = list(invoice.exception_codes or [])
    old_status = invoice.status
    new_status = resolve_status(codes)

    invoice.exception_codes = codes
    invoice.status = new_status
    invoice.version = (invoice.version or 1) + 1

    if sorted(old_codes) != sorted(codes):
        AuditService.log(
            db,
            entity_type="invoice",
            entity_id=invoice.id,
            action="EXCEPTIONS_DETECTED",
            user_id=actor_id,
            field_name="exception_codes",
            old_value=old_codes,
            new_value=codes,
        )
    if old_status != new_status:
        AuditService.log(
            db,
            entity_type="invoice",
            entity_id=invoice.id,
            action="STATUS_CHANGED",
            user_id=actor_id,
            field_name="status",
            old_value=old_status,
            new_value=new_status,
        )


def run_validation(db: Session, invoice: Invoice, actor_id: uuid.UUID) -> list[str]:
    codes = validate(db, invoice)
    apply_result(db, invoice, codes, actor_id)
    return codes


def describe_exceptions(db: Session, invoice: Invoice) -> list[dict[str, str]]:
    """VAL-06 message per code, with the difference and duplicate Request ID filled in at read time."""
    described = []
    for code in invoice.exception_codes or []:
        template = EXCEPTION_MESSAGES.get(code, code)
        if code == TOTAL_MISMATCH:
            difference = total_difference(invoice)
            message = template.format(difference=format_rupiah(abs(difference)) if difference is not None else "total tidak ditemukan")
        elif code == POSSIBLE_DUPLICATE:
            duplicate = find_duplicate(db, invoice)
            message = template.format(request_id=duplicate.request_id if duplicate else "-")
        else:
            message = template
        described.append({"code": code, "message": message})
    return described
