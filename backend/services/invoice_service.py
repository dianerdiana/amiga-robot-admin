import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload, selectinload

from core.aws import get_s3_client, s3_key
from core.config import settings
from models.audit_log import AuditLog
from models.client import Client
from models.invoice import Invoice, InvoiceStatus
from models.user import User, UserRole
from schemas.invoice import (
    DEFAULT_REQUEST_TYPE,
    AssignedClient,
    AuditEntry,
    ClientRef,
    ExtractionStatus,
    FileUrlResponse,
    InvoiceChannel,
    InvoiceDecision,
    InvoiceDetail,
    InvoiceItemResponse,
    InvoicePage,
    InvoiceSummary,
    InvoiceUploadResponse,
    PreviousRequestRef,
    UserRef,
)
from services.access import assert_client_access, assigned_client_ids, clients_with_reviewer
from services.audit_service import AuditService
from services.extraction.schema import ExtractedInvoice
from services.validation_service import EXTRACTION_FAILURE_CODES, describe_exceptions

logger = logging.getLogger(__name__)

NO_REVIEWER_ISSUE = "NO_REVIEWER"
DRAFT_STATUSES = (InvoiceStatus.READY_FOR_REVIEW, InvoiceStatus.EXCEPTION, InvoiceStatus.POSSIBLE_DUPLICATE)
DECISION_STATUSES = (InvoiceStatus.AMIGA_REVIEWED, InvoiceStatus.REJECTED)

# UPL-02: the file type is detected from the content (magic bytes), not the extension.
_HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"hevm", b"hevs", b"mif1", b"msf1"}
_EXTENSIONS = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}

HEIC_MESSAGE = "Format HEIC belum didukung, ubah ke JPG atau PNG."
UNSUPPORTED_MESSAGE = "Format berkas tidak didukung. Unggah berkas PDF, JPG, atau PNG."
TOO_LARGE_MESSAGE = "Ukuran berkas melebihi 10 MB. Unggah berkas yang lebih kecil."
EMPTY_FILE_MESSAGE = "Berkas kosong. Pilih berkas invoice yang valid."
STORAGE_FAILED_MESSAGE = (
    "Gagal menyimpan berkas ke server. Request ID belum dibuat. "
    "Silakan periksa koneksi dan coba beberapa saat lagi."
)
NOT_FOUND_MESSAGE = "Request invoice tidak ditemukan."


def detect_mime_type(data: bytes) -> str:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[4:8] == b"ftyp" and data[8:12] in _HEIC_BRANDS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=HEIC_MESSAGE)
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=UNSUPPORTED_MESSAGE)


def _user_ref(user: User) -> UserRef:
    return UserRef(id=user.id, name=user.name, is_system=user.role == UserRole.ROBOT_ADMIN)


class InvoiceService:
    # ------------------------------------------------------------------
    # Upload (UC-1, UPL-01 to UPL-04)
    # ------------------------------------------------------------------
    @staticmethod
    def upload_invoice(
        db: Session,
        user: User,
        *,
        client_id: uuid.UUID,
        channel: InvoiceChannel,
        request_date: date,
        data: bytes,
        original_filename: str,
        previous_request_id: uuid.UUID | None = None,
    ) -> InvoiceUploadResponse:
        assert_client_access(db, user, client_id)
        if not data:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=EMPTY_FILE_MESSAGE)
        if len(data) > settings.UPLOAD_MAX_BYTES:
            raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=TOO_LARGE_MESSAGE)
        mime_type = detect_mime_type(data)

        if previous_request_id is not None:
            previous = db.get(Invoice, previous_request_id)
            if previous is None or previous.client_id != client_id or previous.status != InvoiceStatus.REJECTED:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Request sebelumnya harus berstatus REJECTED dan milik klien yang sama.",
                )

        sequence = db.execute(text("SELECT nextval('invoice_request_seq')")).scalar_one()
        invoice = Invoice(
            id=uuid.uuid4(),
            request_id=f"REQ-{datetime.now(timezone.utc).year}-{sequence:06d}",
            client_id=client_id,
            uploaded_by=user.id,
            previous_request_id=previous_request_id,
            request_type=DEFAULT_REQUEST_TYPE,
            channel=channel.value,
            request_date=request_date,
            original_filename=(original_filename or "invoice").strip()[:255],
            mime_type=mime_type,
            file_size=len(data),
            status=InvoiceStatus.QUEUED,
        )
        invoice.file_key = s3_key("clients", str(client_id), "invoices", f"{invoice.id}.{_EXTENSIONS[mime_type]}")
        db.add(invoice)
        db.flush()

        # UC-1 A2: if the S3 upload fails, the transaction is rolled back and no Request ID is issued.
        s3 = get_s3_client()
        try:
            s3.put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=invoice.file_key,
                Body=data,
                ContentType=mime_type,
            )
        except (ClientError, BotoCoreError):
            logger.exception("Upload invoice ke S3 gagal: key=%s", invoice.file_key)
            db.rollback()
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=STORAGE_FAILED_MESSAGE)

        AuditService.log(
            db,
            entity_type="invoice",
            entity_id=invoice.id,
            action="UPLOADED",
            user_id=user.id,
            field_name="status",
            new_value=InvoiceStatus.QUEUED,
        )
        try:
            db.commit()
        except Exception:
            db.rollback()
            _delete_object_quietly(invoice.file_key)
            raise
        db.refresh(invoice)

        client = db.get(Client, client_id)
        return InvoiceUploadResponse(
            id=invoice.id,
            request_id=invoice.request_id,
            status=invoice.status,
            client=ClientRef.model_validate(client),
            has_reviewer=client_id in clients_with_reviewer(db, [client_id]),
            original_filename=invoice.original_filename,
            file_size=invoice.file_size,
            mime_type=invoice.mime_type,
            channel=invoice.channel,
            request_type=invoice.request_type,
            request_date=invoice.request_date,
            uploaded_by=_user_ref(user),
            created_at=invoice.created_at,
        )

    # ------------------------------------------------------------------
    # Queue and detail (QUE-01, QUE-02, UC-5, UC-6)
    # ------------------------------------------------------------------
    @staticmethod
    def list_assigned_clients(db: Session, user: User) -> list[AssignedClient]:
        client_ids = assigned_client_ids(db, user)
        if not client_ids:
            return []
        reviewed = clients_with_reviewer(db, client_ids)
        clients = db.query(Client).filter(Client.id.in_(client_ids)).order_by(Client.name).all()
        return [
            AssignedClient(id=c.id, code=c.code, name=c.name, has_reviewer=c.id in reviewed) for c in clients
        ]

    @staticmethod
    def list_invoices(
        db: Session,
        user: User,
        *,
        client_id: uuid.UUID | None = None,
        status_filter: InvoiceStatus | None = None,
        issue: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> InvoicePage:
        client_ids = assigned_client_ids(db, user)
        if client_id is not None:
            if client_id not in client_ids:
                assert_client_access(db, user, client_id)
            client_ids = [client_id]
        reviewed = clients_with_reviewer(db, client_ids)

        query = db.query(Invoice).filter(Invoice.client_id.in_(client_ids))
        if status_filter is not None:
            query = query.filter(Invoice.status == status_filter)
        if issue == NO_REVIEWER_ISSUE:
            query = query.filter(Invoice.client_id.notin_(reviewed)) if reviewed else query
        elif issue:
            query = query.filter(Invoice.exception_codes.any(issue))
        if date_from is not None:
            query = query.filter(Invoice.request_date >= date_from)
        if date_to is not None:
            query = query.filter(Invoice.request_date <= date_to)

        total = query.with_entities(func.count(Invoice.id)).scalar()
        rows = (
            query.options(joinedload(Invoice.client))
            .order_by(Invoice.created_at.desc(), Invoice.id)
            .offset(skip)
            .limit(limit)
            .all()
        )
        return InvoicePage(
            items=[_summary(invoice, invoice.client_id in reviewed) for invoice in rows],
            total=total,
            skip=skip,
            limit=limit,
        )

    @staticmethod
    def get_accessible_invoice(db: Session, user: User, invoice_id: uuid.UUID) -> Invoice:
        """Load the invoice and enforce client isolation (ACC-03) before any data is returned."""
        invoice = (
            db.query(Invoice)
            .options(
                joinedload(Invoice.client),
                joinedload(Invoice.uploader),
                joinedload(Invoice.reviewer),
                selectinload(Invoice.items),
            )
            .filter(Invoice.id == invoice_id)
            .first()
        )
        if invoice is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NOT_FOUND_MESSAGE)
        assert_client_access(db, user, invoice.client_id)
        return invoice

    @staticmethod
    def get_detail(db: Session, user: User, invoice_id: uuid.UUID) -> InvoiceDetail:
        invoice = InvoiceService.get_accessible_invoice(db, user, invoice_id)
        has_reviewer = invoice.client_id in clients_with_reviewer(db, [invoice.client_id])
        processing = invoice.status in (InvoiceStatus.QUEUED, InvoiceStatus.PROCESSING)

        items = [] if processing else [InvoiceItemResponse.model_validate(item) for item in invoice.items]
        subtotal = sum((item.amount or Decimal("0") for item in invoice.items), Decimal("0")) if items else None

        previous = None
        if invoice.previous_request_id is not None:
            prev = db.get(Invoice, invoice.previous_request_id)
            if prev is not None:
                previous = PreviousRequestRef(
                    id=prev.id, request_id=prev.request_id, status=prev.status, reject_note=prev.reject_note
                )

        summary = _summary(invoice, has_reviewer)
        return InvoiceDetail(
            **summary.model_dump(),
            request_type=invoice.request_type,
            channel=invoice.channel,
            invoice_date=invoice.invoice_date,
            bank_account=invoice.bank_account,
            tax_amount=invoice.tax_amount,
            discount_amount=invoice.discount_amount,
            subtotal_amount=subtotal,
            items=items,
            exceptions=describe_exceptions(db, invoice),
            original_filename=invoice.original_filename,
            file_size=invoice.file_size,
            mime_type=invoice.mime_type,
            uploaded_by=_user_ref(invoice.uploader),
            extracted_at=invoice.extracted_at,
            is_draft=invoice.status in DRAFT_STATUSES,
            decision=_decision(db, invoice),
            previous_request=previous,
            version=invoice.version,
        )

    @staticmethod
    def get_history(db: Session, user: User, invoice_id: uuid.UUID) -> list[AuditEntry]:
        invoice = InvoiceService.get_accessible_invoice(db, user, invoice_id)
        return [
            AuditEntry(
                id=entry.id,
                created_at=entry.created_at,
                user=_user_ref(actor),
                action=entry.action,
                field_name=entry.field_name,
                old_value=entry.old_value,
                new_value=entry.new_value,
            )
            for entry, actor in AuditService.list_for(db, "invoice", invoice.id)
        ]

    @staticmethod
    def get_file_url(db: Session, user: User, invoice_id: uuid.UUID) -> FileUrlResponse:
        """Short-lived presigned URL (REV-08). Opening the file is not audited (AUD-01)."""
        invoice = InvoiceService.get_accessible_invoice(db, user, invoice_id)
        ascii_name = invoice.original_filename.encode("ascii", "ignore").decode().replace('"', "") or "invoice"
        try:
            url = get_s3_client().generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": settings.S3_BUCKET_NAME,
                    "Key": invoice.file_key,
                    "ResponseContentType": invoice.mime_type,
                    "ResponseContentDisposition": f'inline; filename="{ascii_name}"',
                },
                ExpiresIn=settings.S3_PRESIGNED_URL_EXPIRE_SECONDS,
            )
        except (ClientError, BotoCoreError):
            logger.exception("Gagal membuat presigned URL: key=%s", invoice.file_key)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Berkas asli tidak dapat diambil saat ini. Coba lagi beberapa saat lagi.",
            )
        return FileUrlResponse(
            url=url,
            expires_in=settings.S3_PRESIGNED_URL_EXPIRE_SECONDS,
            mime_type=invoice.mime_type,
            original_filename=invoice.original_filename,
            file_size=invoice.file_size,
        )

    # ------------------------------------------------------------------
    # Extraction (EXT-01, EXT-04)
    # ------------------------------------------------------------------
    @staticmethod
    def get_extraction(db: Session, user: User, invoice_id: uuid.UUID) -> ExtractionStatus:
        invoice = InvoiceService.get_accessible_invoice(db, user, invoice_id)
        return ExtractionStatus(
            invoice_id=invoice.id,
            request_id=invoice.request_id,
            status=invoice.status,
            attempts=invoice.extraction_attempts,
            started_at=invoice.extraction_started_at,
            extracted_at=invoice.extracted_at,
            error=invoice.extraction_error,
            exceptions=describe_exceptions(db, invoice),
            result=(
                ExtractedInvoice.model_validate(invoice.extraction_result)
                if invoice.extraction_result is not None
                else None
            ),
        )

    @staticmethod
    def requeue_extraction(db: Session, user: User, invoice_id: uuid.UUID) -> ExtractionStatus:
        """Re-queue a failed extraction. Only allowed from EXCEPTION caused by an extraction failure."""
        invoice = InvoiceService.get_accessible_invoice(db, user, invoice_id)
        failed = set(invoice.exception_codes or []) & set(EXTRACTION_FAILURE_CODES)
        if invoice.status != InvoiceStatus.EXCEPTION or not failed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ekstraksi ulang hanya tersedia untuk dokumen yang gagal diekstraksi atau tidak terbaca.",
            )
        # Lock the row so this cannot race a worker claim or a duplicate request.
        locked = (
            db.query(Invoice)
            .filter(Invoice.id == invoice.id, Invoice.status == InvoiceStatus.EXCEPTION)
            .with_for_update()
            .first()
        )
        if locked is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Data sudah diubah user lain, muat ulang.")

        old_status = locked.status
        locked.status = InvoiceStatus.QUEUED
        locked.exception_codes = []
        locked.extraction_error = None
        locked.extraction_started_at = None
        locked.version = locked.version + 1
        AuditService.log(
            db,
            entity_type="invoice",
            entity_id=locked.id,
            action="EXTRACTION_REQUEUED",
            user_id=user.id,
            field_name="status",
            old_value=old_status,
            new_value=InvoiceStatus.QUEUED,
        )
        db.commit()
        db.expire_all()
        return InvoiceService.get_extraction(db, user, invoice_id)


def _summary(invoice: Invoice, has_reviewer: bool) -> InvoiceSummary:
    return InvoiceSummary(
        id=invoice.id,
        request_id=invoice.request_id,
        client=ClientRef.model_validate(invoice.client),
        vendor_name=invoice.vendor_name,
        invoice_number=invoice.invoice_number,
        total_amount=invoice.total_amount,
        status=invoice.status,
        request_date=invoice.request_date,
        created_at=invoice.created_at,
        exception_codes=list(invoice.exception_codes or []),
        has_reviewer=has_reviewer,
    )


def _decision(db: Session, invoice: Invoice) -> InvoiceDecision | None:
    """Reviewer decision for UC-6; the decision time comes from the audit trail."""
    if invoice.status not in DECISION_STATUSES and invoice.reviewed_by is None:
        return None
    decided_at = (
        db.query(func.max(AuditLog.created_at))
        .filter(
            AuditLog.entity_type == "invoice",
            AuditLog.entity_id == invoice.id,
            or_(
                AuditLog.new_value == InvoiceStatus.AMIGA_REVIEWED.value,
                AuditLog.new_value == InvoiceStatus.REJECTED.value,
            ),
        )
        .scalar()
    )
    return InvoiceDecision(
        status=invoice.status,
        reviewer=_user_ref(invoice.reviewer) if invoice.reviewer else None,
        decided_at=decided_at,
        reject_note=invoice.reject_note,
    )


def _delete_object_quietly(key: str) -> None:
    try:
        get_s3_client().delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except (ClientError, BotoCoreError):
        logger.warning("Gagal menghapus objek S3 yatim: key=%s", key)
