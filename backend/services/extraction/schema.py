"""Data contract for invoice extraction results (EXT-01).

`ExtractedInvoice` is the JSON format stored in invoices.extraction_result and returned
by the extraction endpoint. `EXTRACTION_TOOL_SCHEMA` is the schema sent to Bedrock as the
tool input; it is deliberately simple (amounts as numbers, dates as ISO strings) so the
model can follow it reliably.
"""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field, field_validator


def parse_amount(value: object) -> Decimal | None:
    """Convert a money value to Decimal, tolerating Indonesian formatting (Rp1.250.000,00).

    Unreadable values become None instead of being guessed (EXT-03).
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    text = re.sub(r"[^0-9,.\-]", "", str(value))
    if not re.search(r"\d", text):
        return None
    if "," in text and "." in text:
        # Whichever separator appears last is the decimal separator.
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".") if re.search(r",\d{1,2}$", text) else text.replace(",", "")
    elif text.count(".") > 1 or re.search(r"\.\d{3}$", text):
        # 1.250.000 or 125.000 use Indonesian-style thousands separators.
        text = text.replace(".", "")
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_date(value: object) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _clean_text(value: object, max_length: int) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text[:max_length] or None


class ExtractedItem(BaseModel):
    line_no: int = Field(ge=1)
    description: str | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    amount: Decimal | None = None

    @field_validator("description", mode="before")
    @classmethod
    def _description(cls, value: object) -> str | None:
        return _clean_text(value, 1000)

    @field_validator("quantity", "unit_price", "amount", mode="before")
    @classmethod
    def _amounts(cls, value: object) -> Decimal | None:
        return parse_amount(value)


class ExtractedInvoice(BaseModel):
    readable: bool = True
    vendor_name: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    bank_account: str | None = None
    tax_amount: Decimal | None = None
    discount_amount: Decimal | None = None
    total_amount: Decimal | None = None
    items: list[ExtractedItem] = Field(default_factory=list)

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
        return parse_date(value)

    @field_validator("tax_amount", "discount_amount", "total_amount", mode="before")
    @classmethod
    def _amounts(cls, value: object) -> Decimal | None:
        return parse_amount(value)

    @field_validator("items", mode="before")
    @classmethod
    def _items(cls, value: object) -> list:
        if not value:
            return []
        items = list(value)
        # Make sure line_no is always set and sequential even if the model omits it.
        for index, item in enumerate(items, start=1):
            if isinstance(item, dict) and not item.get("line_no"):
                item["line_no"] = index
        return items


_NULLABLE_NUMBER = {"type": ["number", "null"]}
_NULLABLE_STRING = {"type": ["string", "null"]}

EXTRACTION_TOOL_NAME = "record_invoice"

EXTRACTION_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "readable": {
            "type": "boolean",
            "description": "false jika dokumen buram, terpotong, atau bukan invoice sehingga tidak dapat dibaca.",
        },
        "vendor_name": {**_NULLABLE_STRING, "description": "Nama perusahaan penerbit invoice (penjual)."},
        "invoice_number": {**_NULLABLE_STRING, "description": "Nomor invoice persis seperti tertulis."},
        "invoice_date": {**_NULLABLE_STRING, "description": "Tanggal invoice dalam format YYYY-MM-DD."},
        "bank_account": {
            **_NULLABLE_STRING,
            "description": "Rekening tujuan pembayaran, nama bank dan nomor rekening. null jika tidak tertulis.",
        },
        "tax_amount": {**_NULLABLE_NUMBER, "description": "Total pajak (PPN) dalam Rupiah."},
        "discount_amount": {**_NULLABLE_NUMBER, "description": "Total diskon dalam Rupiah."},
        "total_amount": {**_NULLABLE_NUMBER, "description": "Total tagihan akhir dalam Rupiah."},
        "items": {
            "type": "array",
            "description": "SEMUA baris barang/jasa, berurutan, tanpa ada yang terlewat.",
            "items": {
                "type": "object",
                "properties": {
                    "line_no": {"type": "integer"},
                    "description": _NULLABLE_STRING,
                    "quantity": _NULLABLE_NUMBER,
                    "unit_price": _NULLABLE_NUMBER,
                    "amount": _NULLABLE_NUMBER,
                },
                "required": ["line_no", "description", "quantity", "unit_price", "amount"],
            },
        },
    },
    "required": [
        "readable",
        "vendor_name",
        "invoice_number",
        "invoice_date",
        "bank_account",
        "tax_amount",
        "discount_amount",
        "total_amount",
        "items",
    ],
}
