"""Vouchers from AMIGA_REVIEWED invoices: create (UC-2), list (UC-10), and download (UC-9)."""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session, selectinload

from core.aws import get_s3_client, s3_key
from core.config import settings
from models.client import Client
from models.invoice import Invoice, InvoiceStatus
from models.invoice_item import InvoiceItem
from models.user import User
from models.voucher import Voucher, VoucherStatus
from schemas.invoice import ClientRef, InvoiceItemResponse, UserRef
from schemas.voucher import (
    EligibleInvoice,
    VoucherCreate,
    VoucherDetail,
    VoucherDownload,
    VoucherInvoiceRef,
    VoucherPage,
    VoucherSummary,
    VoucherVendor,
)
from services.access import assert_client_access, assigned_client_ids
from services.audit_service import AuditService
from services.invoice_service import _delete_object_quietly
from services.validation_service import normalize_bank_account, normalize_key
from services.voucher_pdf import VoucherPdfData, VoucherPdfInvoice, VoucherPdfItem, render_voucher_pdf

logger = logging.getLogger(__name__)

# Voucher dates and the per-year sequence follow the operational timezone (WIB).
LOCAL_TZ = ZoneInfo("Asia/Jakarta")

ALREADY_USED_MESSAGE = "Invoice sudah masuk voucher lain, muat ulang daftar."
MIXED_VENDOR_MESSAGE = "Satu voucher hanya untuk satu vendor. Pilih invoice dari vendor yang sama."
MIXED_ACCOUNT_MESSAGE = "Satu voucher hanya untuk satu rekening tujuan. Pilih invoice dengan rekening yang sama."
MISSING_DATA_MESSAGE = "Invoice {number} belum memiliki rekening atau total, sehingga tidak dapat dibuatkan voucher."
CREATE_FAILED_MESSAGE = "Voucher gagal dibuat, coba lagi."
FILE_UNAVAILABLE_MESSAGE = "Berkas voucher tidak dapat diambil, coba lagi."
NOT_FOUND_MESSAGE = "Voucher tidak ditemukan."


def _eligible_filter(client_id: uuid.UUID):
    """VCH-02: AMIGA_REVIEWED invoices of the client that are not in a voucher yet."""
    return (
        Invoice.client_id == client_id,
        Invoice.status == InvoiceStatus.AMIGA_REVIEWED,
        Invoice.voucher_id.is_(None),
    )


class VoucherService:
    # ------------------------------------------------------------------
    # Form data (VCH-01, VCH-02); reading is not audited (AUD-01)
    # ------------------------------------------------------------------
    @staticmethod
    def list_vendors(db: Session, user: User, client_id: uuid.UUID) -> list[VoucherVendor]:
        assert_client_access(db, user, client_id)
        rows = (
            db.query(Invoice.vendor_name, func.count(Invoice.id))
            .filter(*_eligible_filter(client_id))
            .group_by(Invoice.vendor_name)
            .all()
        )
        # Group spelling variants ("PT. Sinar" / "PT Sinar") under one normalized key (VCH-03).
        groups: dict[str, VoucherVendor] = {}
        for name, count in rows:
            key = normalize_key(name)
            if not key:
                continue
            group = groups.get(key)
            if group is None:
                groups[key] = VoucherVendor(key=key, name=name.strip(), invoice_count=count)
            else:
                group.invoice_count += count
        return sorted(groups.values(), key=lambda vendor: vendor.name.lower())

    @staticmethod
    def list_eligible_invoices(db: Session, user: User, client_id: uuid.UUID, vendor_key: str) -> list[EligibleInvoice]:
        assert_client_access(db, user, client_id)
        item_counts = (
            db.query(InvoiceItem.invoice_id, func.count(InvoiceItem.id).label("item_count"))
            .group_by(InvoiceItem.invoice_id)
            .subquery()
        )
        rows = (
            db.query(Invoice, func.coalesce(item_counts.c.item_count, 0))
            .outerjoin(item_counts, item_counts.c.invoice_id == Invoice.id)
            .filter(*_eligible_filter(client_id))
            .order_by(Invoice.invoice_date.asc().nulls_last(), Invoice.created_at)
            .all()
        )
        return [
            EligibleInvoice(
                id=invoice.id,
                request_id=invoice.request_id,
                vendor_name=invoice.vendor_name,
                invoice_number=invoice.invoice_number,
                invoice_date=invoice.invoice_date,
                bank_account=invoice.bank_account,
                bank_key=normalize_bank_account(invoice.bank_account),
                tax_amount=invoice.tax_amount,
                discount_amount=invoice.discount_amount,
                total_amount=invoice.total_amount,
                item_count=item_count,
                original_filename=invoice.original_filename,
                mime_type=invoice.mime_type,
            )
            for invoice, item_count in rows
            if normalize_key(invoice.vendor_name) == vendor_key
        ]

    # ------------------------------------------------------------------
    # List (UC-10, VCH-13); reading is not audited
    # ------------------------------------------------------------------
    @staticmethod
    def list_vouchers(
        db: Session,
        user: User,
        *,
        client_id: uuid.UUID | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> VoucherPage:
        client_ids = assigned_client_ids(db, user)
        if client_id is not None:
            if client_id not in client_ids:
                assert_client_access(db, user, client_id)
            client_ids = [client_id]

        invoice_counts = (
            db.query(Invoice.voucher_id, func.count(Invoice.id).label("invoice_count"))
            .filter(Invoice.voucher_id.isnot(None))
            .group_by(Invoice.voucher_id)
            .subquery()
        )
        query = db.query(Voucher).filter(Voucher.client_id.in_(client_ids))
        total = query.with_entities(func.count(Voucher.id)).scalar()
        rows = (
            query.add_columns(func.coalesce(invoice_counts.c.invoice_count, 0))
            .outerjoin(invoice_counts, invoice_counts.c.voucher_id == Voucher.id)
            .options(selectinload(Voucher.client))
            .order_by(Voucher.created_at.desc(), Voucher.id)
            .offset(skip)
            .limit(limit)
            .all()
        )
        return VoucherPage(
            items=[
                VoucherSummary(
                    id=voucher.id,
                    voucher_number=voucher.voucher_number,
                    client=ClientRef.model_validate(voucher.client),
                    vendor_name=voucher.vendor_name,
                    purpose=voucher.purpose,
                    total_amount=voucher.total_amount,
                    status=voucher.status,
                    created_at=voucher.created_at,
                    invoice_count=invoice_count,
                )
                for voucher, invoice_count in rows
            ],
            total=total,
            skip=skip,
            limit=limit,
        )

    # ------------------------------------------------------------------
    # Create (VCH-03 to VCH-10): one atomic transaction
    # ------------------------------------------------------------------
    @staticmethod
    def create(db: Session, user: User, data: VoucherCreate) -> VoucherDetail:
        # UC-2 A6: a revoked assignment is rejected before anything is locked.
        assert_client_access(db, user, data.client_id)

        # Lock in a fixed order so two Intakes selecting overlapping invoices cannot deadlock.
        invoices = (
            db.query(Invoice)
            .filter(Invoice.id.in_(data.invoice_ids), Invoice.client_id == data.client_id)
            .order_by(Invoice.id)
            .with_for_update()
            .populate_existing()
            .all()
        )
        # Re-check after the lock (VCH-07): a row missing, changed, or used by another voucher.
        if len(invoices) != len(data.invoice_ids) or any(
            invoice.status != InvoiceStatus.AMIGA_REVIEWED or invoice.voucher_id is not None for invoice in invoices
        ):
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_USED_MESSAGE)

        for invoice in invoices:
            if not normalize_bank_account(invoice.bank_account) or invoice.total_amount is None:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=MISSING_DATA_MESSAGE.format(number=invoice.invoice_number or invoice.request_id),
                )
        # VCH-03: one client, one vendor, one bank account, compared after normalization.
        if len({normalize_key(invoice.vendor_name) for invoice in invoices}) != 1:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=MIXED_VENDOR_MESSAGE)
        if len({normalize_bank_account(invoice.bank_account) for invoice in invoices}) != 1:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=MIXED_ACCOUNT_MESSAGE)

        client = db.get(Client, data.client_id)
        now = datetime.now(LOCAL_TZ)
        # Present the invoices in date order on the voucher; the lock order above is by id.
        invoices.sort(key=lambda invoice: (invoice.invoice_date or now.date(), invoice.created_at))
        first = invoices[0]
        total = sum((invoice.total_amount for invoice in invoices), Decimal("0"))

        voucher = Voucher(
            id=uuid.uuid4(),
            voucher_number=f"VCH-{client.code}-{now.year}-{_next_sequence(db, client.id, now.year):05d}",
            client_id=client.id,
            created_by=user.id,
            vendor_name=first.vendor_name.strip(),
            bank_account=first.bank_account.strip(),
            purpose=data.purpose,
            total_amount=total,
            status=VoucherStatus.CREATED,
        )
        voucher.file_key = s3_key("clients", str(client.id), "vouchers", f"{voucher.id}.pdf")
        db.add(voucher)
        db.flush()

        AuditService.log(
            db,
            entity_type="voucher",
            entity_id=voucher.id,
            action="VOUCHER_CREATED",
            user_id=user.id,
            field_name="status",
            new_value=VoucherStatus.CREATED,
        )
        for invoice in invoices:
            invoice.voucher_id = voucher.id
            invoice.status = InvoiceStatus.VOUCHERED
            invoice.version = invoice.version + 1
            AuditService.log(
                db,
                entity_type="invoice",
                entity_id=invoice.id,
                action="VOUCHER_ASSIGNED",
                user_id=user.id,
                field_name="voucher_id",
                new_value=voucher.voucher_number,
            )
            AuditService.log(
                db,
                entity_type="invoice",
                entity_id=invoice.id,
                action="STATUS_CHANGED",
                user_id=user.id,
                field_name="status",
                old_value=InvoiceStatus.AMIGA_REVIEWED,
                new_value=InvoiceStatus.VOUCHERED,
            )
        # Hit every database constraint before anything is written to S3.
        db.flush()

        # UC-2 A3: if the PDF or the upload fails, nothing is saved and invoice statuses stay unchanged.
        try:
            pdf = render_voucher_pdf(_pdf_data(voucher, client, invoices, now))
            get_s3_client().put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=voucher.file_key,
                Body=pdf,
                ContentType="application/pdf",
            )
        except (ClientError, BotoCoreError, ValueError, OSError):
            logger.exception("Pembuatan voucher gagal: key=%s", voucher.file_key)
            db.rollback()
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=CREATE_FAILED_MESSAGE)

        try:
            db.commit()
        except Exception:
            db.rollback()
            _delete_object_quietly(voucher.file_key)
            raise
        return VoucherService.get_detail(db, user, voucher.id)

    # ------------------------------------------------------------------
    # Download (UC-9, VCH-11, VCH-12)
    # ------------------------------------------------------------------
    @staticmethod
    def download(db: Session, user: User, voucher_id: uuid.UUID) -> VoucherDownload:
        """Issue a short-lived link. The first download moves the voucher and its invoices to
        SENT_TO_CLIENT; the status changes when the link is issued, not when the browser finishes."""
        voucher = db.get(Voucher, voucher_id)
        if voucher is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_MESSAGE)
        assert_client_access(db, user, voucher.client_id)

        # UC-9 A2: a concurrent first download waits here, then sees SENT_TO_CLIENT and becomes a re-download.
        voucher = db.query(Voucher).filter(Voucher.id == voucher_id).with_for_update().populate_existing().one()

        # UC-9 A3: a missing file changes nothing.
        s3 = get_s3_client()
        try:
            s3.head_object(Bucket=settings.S3_BUCKET_NAME, Key=voucher.file_key)
        except (ClientError, BotoCoreError):
            logger.exception("Berkas voucher tidak ditemukan: key=%s", voucher.file_key)
            db.rollback()
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=FILE_UNAVAILABLE_MESSAGE)

        first_download = voucher.status == VoucherStatus.CREATED
        if first_download:
            voucher.status = VoucherStatus.SENT_TO_CLIENT
            voucher.sent_at = datetime.now(timezone.utc)
            AuditService.log(
                db,
                entity_type="voucher",
                entity_id=voucher.id,
                action="STATUS_CHANGED",
                user_id=user.id,
                field_name="status",
                old_value=VoucherStatus.CREATED,
                new_value=VoucherStatus.SENT_TO_CLIENT,
            )
            invoices = (
                db.query(Invoice)
                .filter(Invoice.voucher_id == voucher.id)
                .order_by(Invoice.id)
                .with_for_update()
                .all()
            )
            for invoice in invoices:
                if invoice.status != InvoiceStatus.VOUCHERED:
                    continue
                invoice.status = InvoiceStatus.SENT_TO_CLIENT
                invoice.version = invoice.version + 1
                AuditService.log(
                    db,
                    entity_type="invoice",
                    entity_id=invoice.id,
                    action="STATUS_CHANGED",
                    user_id=user.id,
                    field_name="status",
                    old_value=InvoiceStatus.VOUCHERED,
                    new_value=InvoiceStatus.SENT_TO_CLIENT,
                )
        # AUD-01: every download is recorded, first and later ones.
        AuditService.log(
            db,
            entity_type="voucher",
            entity_id=voucher.id,
            action="VOUCHER_DOWNLOADED",
            user_id=user.id,
            field_name="download",
            new_value="pertama" if first_download else "ulang",
        )

        filename = f"{voucher.voucher_number}.pdf"
        try:
            url = s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": settings.S3_BUCKET_NAME,
                    "Key": voucher.file_key,
                    "ResponseContentType": "application/pdf",
                    "ResponseContentDisposition": f'attachment; filename="{filename}"',
                },
                ExpiresIn=settings.S3_PRESIGNED_URL_EXPIRE_SECONDS,
            )
        except (ClientError, BotoCoreError):
            logger.exception("Gagal membuat presigned URL voucher: key=%s", voucher.file_key)
            db.rollback()
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=FILE_UNAVAILABLE_MESSAGE)

        db.commit()
        db.expire_all()
        return VoucherDownload(
            url=url,
            expires_in=settings.S3_PRESIGNED_URL_EXPIRE_SECONDS,
            filename=filename,
            first_download=first_download,
            voucher=VoucherService.get_detail(db, user, voucher_id),
        )

    @staticmethod
    def get_detail(db: Session, user: User, voucher_id: uuid.UUID) -> VoucherDetail:
        voucher = (
            db.query(Voucher)
            .options(
                selectinload(Voucher.invoices).selectinload(Invoice.items),
                selectinload(Voucher.client),
                selectinload(Voucher.creator),
            )
            .filter(Voucher.id == voucher_id)
            .first()
        )
        if voucher is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_MESSAGE)
        assert_client_access(db, user, voucher.client_id)
        return VoucherDetail(
            id=voucher.id,
            voucher_number=voucher.voucher_number,
            client=ClientRef.model_validate(voucher.client),
            vendor_name=voucher.vendor_name,
            bank_account=voucher.bank_account,
            purpose=voucher.purpose,
            total_amount=voucher.total_amount,
            status=voucher.status,
            created_by=UserRef(id=voucher.creator.id, name=voucher.creator.name),
            created_at=voucher.created_at,
            sent_at=voucher.sent_at,
            invoices=[
                VoucherInvoiceRef(
                    id=invoice.id,
                    request_id=invoice.request_id,
                    invoice_number=invoice.invoice_number,
                    invoice_date=invoice.invoice_date,
                    status=invoice.status,
                    tax_amount=invoice.tax_amount,
                    discount_amount=invoice.discount_amount,
                    total_amount=invoice.total_amount,
                    items=[InvoiceItemResponse.model_validate(item) for item in invoice.items],
                )
                for invoice in sorted(voucher.invoices, key=lambda i: (i.invoice_date is None, i.invoice_date, i.created_at))
            ],
        )


def _next_sequence(db: Session, client_id: uuid.UUID, year: int) -> int:
    """VCH-08 counter per client per year. The upsert row-locks the counter until commit,
    so concurrent vouchers for one client get consecutive numbers; a rollback releases the number."""
    return db.execute(
        text(
            "INSERT INTO voucher_sequences (client_id, year, last_value) VALUES (:client_id, :year, 1) "
            "ON CONFLICT (client_id, year) DO UPDATE SET last_value = voucher_sequences.last_value + 1 "
            "RETURNING last_value"
        ),
        {"client_id": client_id, "year": year},
    ).scalar_one()


def _pdf_data(voucher: Voucher, client: Client, invoices: list[Invoice], now: datetime) -> VoucherPdfData:
    return VoucherPdfData(
        voucher_number=voucher.voucher_number,
        client_name=client.name,
        vendor_name=voucher.vendor_name,
        bank_account=voucher.bank_account,
        purpose=voucher.purpose,
        created_date=now.date(),
        total_amount=voucher.total_amount,
        invoices=[
            VoucherPdfInvoice(
                invoice_number=invoice.invoice_number,
                invoice_date=invoice.invoice_date,
                tax_amount=invoice.tax_amount,
                discount_amount=invoice.discount_amount,
                total_amount=invoice.total_amount,
                items=[
                    VoucherPdfItem(
                        line_no=item.line_no,
                        description=item.description,
                        quantity=item.quantity,
                        unit_price=item.unit_price,
                        amount=item.amount,
                    )
                    for item in invoice.items
                ],
            )
            for invoice in invoices
        ],
    )

