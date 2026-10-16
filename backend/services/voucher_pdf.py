"""Voucher PDF (VCH-10, PRD 5.8 minimum template), rendered with ReportLab.

Pure function of the data passed in: no database or S3 access, so it can be tested on its own.
The official AMIGA template is still pending, so the page carries a "Template sementara" marker.
"""

import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from services.validation_service import format_rupiah

# Palette from templates/*.html (primary navy, slate borders and text).
NAVY = colors.HexColor("#1E3A8A")
TEXT = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#475569")
BORDER = colors.HexColor("#CBD5E1")
SURFACE_MUTED = colors.HexColor("#F1F5F9")
WARNING = colors.HexColor("#92400E")
WARNING_BG = colors.HexColor("#FEF3C7")


@dataclass
class VoucherPdfItem:
    line_no: int
    description: str | None
    quantity: Decimal | None
    unit_price: Decimal | None
    amount: Decimal | None


@dataclass
class VoucherPdfInvoice:
    invoice_number: str | None
    invoice_date: date | None
    tax_amount: Decimal | None
    discount_amount: Decimal
    total_amount: Decimal | None
    items: list[VoucherPdfItem] = field(default_factory=list)


@dataclass
class VoucherPdfData:
    voucher_number: str
    client_name: str
    vendor_name: str
    bank_account: str
    purpose: str
    created_date: date
    total_amount: Decimal
    invoices: list[VoucherPdfInvoice]


def format_date(value: date | None) -> str:
    return value.strftime("%d/%m/%Y") if value else "-"


def format_quantity(value: Decimal | None) -> str:
    """Quantity without trailing zeros, Indonesian separators (1.250,5)."""
    if value is None:
        return "-"
    text = f"{value.normalize():,f}"
    integer, _, fraction = text.partition(".")
    integer = integer.replace(",", ".")
    return f"{integer},{fraction}" if fraction else integer


def _styles() -> dict[str, ParagraphStyle]:
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=8.5, leading=11, textColor=TEXT)
    return {
        "base": base,
        "title": ParagraphStyle("title", parent=base, fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=NAVY),
        "subtitle": ParagraphStyle("subtitle", parent=base, textColor=MUTED),
        "label": ParagraphStyle("label", parent=base, fontName="Helvetica-Bold", textColor=MUTED),
        "value": ParagraphStyle("value", parent=base, fontSize=9.5, leading=12),
        "strong": ParagraphStyle("strong", parent=base, fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=NAVY),
        "head": ParagraphStyle("head", parent=base, fontName="Helvetica-Bold", textColor=colors.white),
        "head_right": ParagraphStyle("head_right", parent=base, fontName="Helvetica-Bold", textColor=colors.white, alignment=TA_RIGHT),
        "right": ParagraphStyle("right", parent=base, alignment=TA_RIGHT),
        "right_bold": ParagraphStyle("right_bold", parent=base, fontName="Helvetica-Bold", alignment=TA_RIGHT),
        "note": ParagraphStyle("note", parent=base, fontSize=7.5, leading=9.5, textColor=MUTED),
        "marker": ParagraphStyle("marker", parent=base, fontName="Helvetica-Bold", fontSize=8, textColor=WARNING, alignment=TA_RIGHT),
    }


def _p(text: str | None, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text or "-"), style)


def render_voucher_pdf(data: VoucherPdfData, *, compress: bool = True) -> bytes:
    """Render the voucher as an A4 PDF and return its bytes."""
    s = _styles()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=f"Voucher {data.voucher_number}",
        author="AMIGA Robot Admin",
        pageCompression=1 if compress else 0,
    )
    width = doc.width
    story: list = []

    # Header: title on the left, temporary-template marker on the right.
    header = Table(
        [
            [_p("VOUCHER PEMBAYARAN", s["title"]), _p("TEMPLATE SEMENTARA", s["marker"])],
            [_p(data.client_name, s["subtitle"]), _p("Template resmi AMIGA belum tersedia", s["note"])],
        ],
        colWidths=[width * 0.65, width * 0.35],
    )
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("LINEBELOW", (0, 1), (-1, 1), 1.5, NAVY),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
                ("BACKGROUND", (1, 0), (1, 0), WARNING_BG),
                ("RIGHTPADDING", (1, 0), (1, 0), 4),
            ]
        )
    )
    story += [header, Spacer(1, 6 * mm)]

    # Identity block (VCH-10): Nomor, Tanggal, Nama, Rekening tujuan, Peruntukan, Nominal.
    info_rows = [
        ("Nomor", _p(data.voucher_number, s["value"])),
        ("Tanggal", _p(format_date(data.created_date), s["value"])),
        ("Nama", _p(data.vendor_name, s["value"])),
        ("Rekening tujuan", _p(data.bank_account, s["value"])),
        ("Peruntukan", _p(data.purpose, s["value"])),
        ("Nominal", _p(format_rupiah(data.total_amount), s["strong"])),
    ]
    info = Table([[_p(label, s["label"]), value] for label, value in info_rows], colWidths=[34 * mm, width - 34 * mm])
    info.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, BORDER),
                ("BACKGROUND", (0, 0), (0, -1), SURFACE_MUTED),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story += [info, Spacer(1, 6 * mm), _p("Tabel Invoice Items", s["label"]), Spacer(1, 2 * mm)]

    # Items table: every invoice_item of every invoice, then each invoice's tax/discount summary.
    col_widths = [32 * mm, 9 * mm, None, 16 * mm, 28 * mm, 30 * mm]
    fixed = sum(w for w in col_widths if w)
    col_widths[2] = width - fixed
    rows: list[list] = [
        [
            _p("Nomor Invoice", s["head"]),
            _p("No", s["head"]),
            _p("Deskripsi", s["head"]),
            _p("Qty", s["head_right"]),
            _p("Harga Satuan", s["head_right"]),
            _p("Jumlah", s["head_right"]),
        ]
    ]
    style_cmds: list[tuple] = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for invoice in data.invoices:
        label = f"{invoice.invoice_number or '-'}\n{format_date(invoice.invoice_date)}"
        first_row = len(rows)
        items = invoice.items or [VoucherPdfItem(line_no=0, description=None, quantity=None, unit_price=None, amount=None)]
        for item in items:
            rows.append(
                [
                    _p(label, s["base"]) if len(rows) == first_row else "",
                    _p(str(item.line_no) if item.line_no else "-", s["base"]),
                    _p(item.description, s["base"]),
                    _p(format_quantity(item.quantity), s["right"]),
                    _p(format_rupiah(item.unit_price), s["right"]),
                    _p(format_rupiah(item.amount), s["right"]),
                ]
            )
        subtotal = sum((item.amount or Decimal("0") for item in invoice.items), Decimal("0"))
        summary = (
            f"Subtotal {format_rupiah(subtotal)}  ·  Diskon {format_rupiah(invoice.discount_amount)}  ·  "
            f"Pajak {format_rupiah(invoice.tax_amount or Decimal('0'))}"
        )
        summary_row = len(rows)
        rows.append(["", "", _p(summary, s["right"]), "", "", _p(format_rupiah(invoice.total_amount), s["right_bold"])])
        style_cmds += [
            ("SPAN", (2, summary_row), (4, summary_row)),
            ("BACKGROUND", (0, summary_row), (-1, summary_row), SURFACE_MUTED),
            ("LINEBELOW", (0, summary_row), (-1, summary_row), 0.75, BORDER),
        ]
    total_row = len(rows)
    rows.append(["", "", _p("Nominal voucher", s["right_bold"]), "", "", _p(format_rupiah(data.total_amount), s["right_bold"])])
    style_cmds += [
        ("SPAN", (2, total_row), (4, total_row)),
        ("LINEABOVE", (0, total_row), (-1, total_row), 1.25, NAVY),
    ]
    items_table = Table(rows, colWidths=col_widths, repeatRows=1)
    items_table.setStyle(TableStyle(style_cmds))
    story.append(items_table)

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 10 * mm, f"{data.voucher_number} · Dokumen dibuat oleh AMIGA Robot Admin")
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Halaman {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
