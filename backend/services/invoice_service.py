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
from models.invoice_item import InvoiceItem
from models.user import User, UserRole
from models.user_client import UserClient
from schemas.invoice import (
    APPROVAL_NOTE_LABEL,
    DEFAULT_REQUEST_TYPE,
    AssignedClient,
    AuditEntry,
    ClientRef,
    CorrectionNote,
    ExtractionStatus,
    FileUrlResponse,
    InvoiceApproval,
    InvoiceChannel,
    InvoiceCorrection,
    InvoiceDecision,
    InvoiceDetail,
    InvoiceItemResponse,
    InvoicePage,
    InvoiceRejection,
    InvoiceSummary,
    InvoiceUploadResponse,
    PreviousRequestRef,
    UserRef,
)
from services.access import assert_client_access, assigned_client_ids, clients_with_reviewer
from services.audit_service import AuditService
from services.extraction.schema import ExtractedInvoice
from services.validation_service import EXTRACTION_FAILURE_CODES, describe_exceptions, run_validation

logger = logging.getLogger(__name__)

NO_REVIEWER_ISSUE = "NO_REVIEWER"
DRAFT_STATUSES = (InvoiceStatus.READY_FOR_REVIEW, InvoiceStatus.EXCEPTION, InvoiceStatus.POSSIBLE_DUPLICATE)
DECISION_STATUSES = (InvoiceStatus.AMIGA_REVIEWED, InvoiceStatus.REJECTED)
# Statuses where Intake and Finance Reviewer may correct extracted data. POSSIBLE_DUPLICATE is a warning, not a lock.
EDITABLE_STATUSES = (InvoiceStatus.READY_FOR_REVIEW, InvoiceStatus.EXCEPTION, InvoiceStatus.POSSIBLE_DUPLICATE)
EDITOR_ROLES = (UserRole.INTAKE, UserRole.FINANCE_REVIEWER)
# Approval is allowed from READY_FOR_REVIEW, and manually (with a justification note) from POSSIBLE_DUPLICATE.
APPROVABLE_STATUSES = (InvoiceStatus.READY_FOR_REVIEW, InvoiceStatus.POSSIBLE_DUPLICATE)
CORRECTABLE_FIELDS = (
    "vendor_name",
    "invoice_number",
    "invoice_date",
    "bank_account",
    "tax_amount",
    "discount_amount",
    "total_amount",
)
ITEM_FIELDS = ("description", "quantity", "unit_price", "amount")
CONFLICT_MESSAGE = "Data sudah diubah user lain, muat ulang."
NOT_READY_MESSAGE = "Dokumen belum siap disetujui."
SOD_MESSAGE = "Anda tidak dapat meninjau dokumen yang Anda unggah."

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

        # Temporary operating mode: intake-created invoices become visible in the
        # reviewer queue through explicit client assignments, not global access.
        InvoiceService.ensure_reviewer_assignments(db, client_id)

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

    @staticmethod
    def ensure_reviewer_assignments(db: Session, client_id: uuid.UUID) -> None:
        # Temporary operating mode requested for the current reviewer workflow:
        # Intake uploads make the selected client visible to every active Finance
        # Reviewer through explicit user_clients assignments. This is idempotent.
        if not settings.REVIEWER_AUTO_ASSIGN_ON_UPLOAD:
            return
        client = db.get(Client, client_id)
        if client is None or not client.is_active:
            return
        reviewers = (
            db.query(User)
            .filter(User.role == UserRole.FINANCE_REVIEWER, User.is_active.is_(True))
            .all()
        )
        for reviewer in reviewers:
            assignment = (
                db.query(UserClient)
                .filter(
                    UserClient.user_id == reviewer.id,
                    UserClient.client_id == client_id,
                )
                .first()
            )
            if assignment is None:
                db.add(UserClient(user_id=reviewer.id, client_id=client_id))

    @staticmethod
    def ensure_reviewer_assignments_for_all_clients(db: Session) -> None:
        if not settings.REVIEWER_AUTO_ASSIGN_ON_UPLOAD:
            return
        active_clients = db.query(Client).filter(Client.is_active.is_(True)).all()
        for client in active_clients:
            InvoiceService.ensure_reviewer_assignments(db, client.id)

    # ------------------------------------------------------------------
    # Reviewer queue with global pagination across multiple statuses (ACC-03)
    # ------------------------------------------------------------------
    @staticmethod
    def list_review_queue(
        db: Session,
        user: User,
        *,
        statuses: list[InvoiceStatus] | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> InvoicePage:
        client_ids = assigned_client_ids(db, user)
        if not client_ids:
            return InvoicePage(items=[], total=0, skip=skip, limit=limit)
        reviewed = clients_with_reviewer(db, client_ids)

        query = db.query(Invoice).filter(Invoice.client_id.in_(client_ids))
        if statuses:
            query = query.filter(Invoice.status.in_(statuses))
        total = query.with_entities(func.count(Invoice.id)).scalar() or 0
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
        # SoD (ACC-04): the uploader never decides; the backend re-checks this on approve/reject.
        decides = user.role == UserRole.FINANCE_REVIEWER and invoice.uploaded_by != user.id
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
            can_edit=user.role in EDITOR_ROLES and invoice.status in EDITABLE_STATUSES,
            can_approve=decides and invoice.status in APPROVABLE_STATUSES,
            can_reject=decides and invoice.status in EDITABLE_STATUSES,
            approve_requires_note=invoice.status == InvoiceStatus.POSSIBLE_DUPLICATE,
            last_correction=_last_correction(db, invoice.id),
        )

    # ------------------------------------------------------------------
    # Data correction (Intake and Finance Reviewer)
    # ------------------------------------------------------------------
    @staticmethod
    def correct_invoice(db: Session, user: User, invoice_id: uuid.UUID, data: InvoiceCorrection) -> InvoiceDetail:
        """Apply corrections (Intake or Finance Reviewer) with per-field audit, re-validation, and optimistic locking."""
        InvoiceService.get_accessible_invoice(db, user, invoice_id)
        # Plain row lock (no outer joins) so FOR UPDATE is valid in PostgreSQL.
        invoice = (
            db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().populate_existing().one()
        )
        if invoice.version != data.version:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CONFLICT_MESSAGE)
        if invoice.status not in EDITABLE_STATUSES:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Dokumen berstatus {invoice.status.value} tidak dapat dikoreksi.",
            )

        changed = False

        def log(action: str, field: str, old: object, new: object) -> None:
            nonlocal changed
            changed = True
            AuditService.log(
                db,
                entity_type="invoice",
                entity_id=invoice.id,
                action=action,
                user_id=user.id,
                field_name=field,
                old_value=old,
                new_value=new,
            )

        for field in CORRECTABLE_FIELDS:
            old, new = getattr(invoice, field), getattr(data, field)
            if _differs(old, new):
                log("FIELD_UPDATED", field, old, new)
                setattr(invoice, field, new)

        old_items = sorted(invoice.items, key=lambda item: item.line_no)
        items_changed = False
        for index in range(max(len(old_items), len(data.items))):
            line_no = index + 1
            old_item = old_items[index] if index < len(old_items) else None
            new_item = data.items[index] if index < len(data.items) else None
            if old_item is not None and new_item is not None:
                for attr in ITEM_FIELDS:
                    if _differs(getattr(old_item, attr), getattr(new_item, attr)):
                        log("FIELD_UPDATED", f"items[{line_no}].{attr}", getattr(old_item, attr), getattr(new_item, attr))
                        items_changed = True
            elif new_item is not None:
                log("ITEM_ADDED", f"items[{line_no}]", None, _item_summary(new_item))
                items_changed = True
            else:
                log("ITEM_REMOVED", f"items[{line_no}]", _item_summary(old_item), None)
                items_changed = True

        # UC-7 A5: a save without real changes writes no audit and keeps the version.
        if not changed:
            db.rollback()
            return InvoiceService.get_detail(db, user, invoice_id)

        if items_changed:
            # Delete old rows first so unique (invoice_id, line_no) does not clash with the new rows.
            invoice.items.clear()
            db.flush()
            invoice.items = [
                InvoiceItem(
                    line_no=line_no,
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    amount=item.amount,
                )
                for line_no, item in enumerate(data.items, start=1)
            ]

        AuditService.log(
            db,
            entity_type="invoice",
            entity_id=invoice.id,
            action="CORRECTION_NOTE",
            user_id=user.id,
            new_value=data.reason,
        )
        db.flush()
        # Re-validate as the correcting user; this sets status/exception codes and bumps the version once.
        run_validation(db, invoice, user.id)
        db.commit()
        db.expire_all()
        return InvoiceService.get_detail(db, user, invoice_id)

    # ------------------------------------------------------------------
    # Reviewer decision (UC-8, REV-04 to REV-06, ACC-04)
    # ------------------------------------------------------------------
    @staticmethod
    def approve(db: Session, user: User, invoice_id: uuid.UUID, data: InvoiceApproval) -> InvoiceDetail:
        invoice = _lock_for_decision(db, user, invoice_id, data.version)
        if invoice.status not in APPROVABLE_STATUSES:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=NOT_READY_MESSAGE)
        # 2026-10: a POSSIBLE_DUPLICATE may be approved manually, but only with a justification.
        if invoice.status == InvoiceStatus.POSSIBLE_DUPLICATE and not data.note:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=[
                    {
                        "loc": ["body", "note"],
                        "msg": f"{APPROVAL_NOTE_LABEL} wajib diisi untuk menyetujui dokumen POSSIBLE_DUPLICATE.",
                        "type": "invalid_value",
                    }
                ],
            )
        if data.note:
            _log_decision(db, invoice, user, "APPROVAL_NOTE", "approval_note", None, data.note)
        _decide(db, invoice, user, InvoiceStatus.AMIGA_REVIEWED, "APPROVED")
        db.commit()
        db.expire_all()
        return InvoiceService.get_detail(db, user, invoice_id)

    @staticmethod
    def reject(db: Session, user: User, invoice_id: uuid.UUID, data: InvoiceRejection) -> InvoiceDetail:
        invoice = _lock_for_decision(db, user, invoice_id, data.version)
        if invoice.status not in EDITABLE_STATUSES:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Dokumen berstatus {invoice.status.value} tidak dapat ditolak.",
            )
        invoice.reject_note = data.note
        _log_decision(db, invoice, user, "REJECT_NOTE", "reject_note", None, data.note)
        _decide(db, invoice, user, InvoiceStatus.REJECTED, "REJECTED")
        db.commit()
        db.expire_all()
        return InvoiceService.get_detail(db, user, invoice_id)

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
        version=invoice.version,
    )


def _lock_for_decision(db: Session, user: User, invoice_id: uuid.UUID, version: int) -> Invoice:
    """Client access (ACC-03/05), row lock, SoD (ACC-04), and optimistic version check (REV-06)."""
    InvoiceService.get_accessible_invoice(db, user, invoice_id)
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().populate_existing().one()
    if invoice.uploaded_by == user.id:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SOD_MESSAGE)
    if invoice.version != version:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CONFLICT_MESSAGE)
    return invoice


def _log_decision(db: Session, invoice: Invoice, user: User, action: str, field: str, old: object, new: object) -> None:
    AuditService.log(
        db,
        entity_type="invoice",
        entity_id=invoice.id,
        action=action,
        user_id=user.id,
        field_name=field,
        old_value=old,
        new_value=new,
    )


def _decide(db: Session, invoice: Invoice, user: User, new_status: InvoiceStatus, action: str) -> None:
    # reviewed_by is set together with the status (ck_invoices_decision_has_reviewer).
    old_status = invoice.status
    invoice.reviewed_by = user.id
    invoice.status = new_status
    invoice.version = invoice.version + 1
    _log_decision(db, invoice, user, action, "status", old_status, new_status)


def _differs(old: object, new: object) -> bool:
    """Compare stored and submitted values; decimals compare numerically (1250000 == 1250000.00)."""
    if old is None or new is None:
        return old is not new
    if isinstance(old, Decimal) or isinstance(new, Decimal):
        return Decimal(str(old)) != Decimal(str(new))
    return old != new


def _item_summary(item: object) -> str:
    def fmt(value: object) -> str:
        return "-" if value is None else str(value)

    return (
        f"{getattr(item, 'description', None) or '-'} | "
        f"{fmt(getattr(item, 'quantity', None))} x {fmt(getattr(item, 'unit_price', None))} = "
        f"{fmt(getattr(item, 'amount', None))}"
    )


def _last_correction(db: Session, invoice_id: uuid.UUID) -> CorrectionNote | None:
    row = (
        db.query(AuditLog, User)
        .join(User, User.id == AuditLog.user_id)
        .filter(
            AuditLog.entity_type == "invoice",
            AuditLog.entity_id == invoice_id,
            AuditLog.action == "CORRECTION_NOTE",
        )
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    if row is None:
        return None
    entry, author = row
    return CorrectionNote(by=_user_ref(author), at=entry.created_at, reason=entry.new_value or "")


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
