"""Asynchronous extraction worker backed by a Postgres queue (EXT-01, EXT-04, UC-1 steps 6 to 8).

QUEUED invoices are claimed with SELECT ... FOR UPDATE SKIP LOCKED, so multiple
worker threads or processes never process the same invoice. Queue state lives in the
invoices table, so nothing is lost when the server restarts; PROCESSING invoices stuck
for longer than EXTRACTION_STALE_SECONDS are reclaimed.

Run it separately from the API (set EXTRACTION_RUN_IN_API=false for the API):
    python -m workers.extraction_worker
"""

import logging
import signal
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Callable

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.aws import get_s3_client
from core.config import settings
from database import SessionLocal
from models.invoice import Invoice, InvoiceStatus
from models.invoice_item import InvoiceItem
from services.audit_service import AuditService, get_robot_admin_id
from services.extraction import ExtractedInvoice, ExtractionError, Extractor, get_extractor
from services.validation_service import (
    EXTRACTION_FAILED,
    UNREADABLE_DOCUMENT,
    apply_result,
    run_validation,
)

logger = logging.getLogger(__name__)

# EXT-04: one automatic retry before moving to EXCEPTION.
MAX_EXTRACTION_TRIES = 2


def claim_next(db: Session) -> uuid.UUID | None:
    """Claim one QUEUED (or stuck PROCESSING) invoice and mark it PROCESSING."""
    stale_before = datetime.now(timezone.utc) - timedelta(seconds=settings.EXTRACTION_STALE_SECONDS)
    invoice = (
        db.query(Invoice)
        .filter(
            or_(
                Invoice.status == InvoiceStatus.QUEUED,
                (Invoice.status == InvoiceStatus.PROCESSING) & (Invoice.extraction_started_at < stale_before),
            )
        )
        .order_by(Invoice.created_at)
        .with_for_update(skip_locked=True)
        .limit(1)
        .first()
    )
    if invoice is None:
        db.rollback()
        return None

    old_status = invoice.status
    invoice.status = InvoiceStatus.PROCESSING
    invoice.extraction_started_at = datetime.now(timezone.utc)
    if old_status != InvoiceStatus.PROCESSING:
        AuditService.log(
            db,
            entity_type="invoice",
            entity_id=invoice.id,
            action="STATUS_CHANGED",
            user_id=get_robot_admin_id(db),
            field_name="status",
            old_value=old_status,
            new_value=InvoiceStatus.PROCESSING,
        )
    db.commit()
    return invoice.id


def process(invoice_id: uuid.UUID, extractor: Extractor | None = None, session_factory=SessionLocal) -> None:
    """Extract, store the draft, then validate one claimed invoice."""
    extractor = extractor or get_extractor()
    started = time.monotonic()
    with session_factory() as db:
        invoice = db.get(Invoice, invoice_id)
        if invoice is None or invoice.status != InvoiceStatus.PROCESSING:
            return
        robot_id = get_robot_admin_id(db)
        file_key, mime_type, filename = invoice.file_key, invoice.mime_type, invoice.original_filename
        # End the read transaction so the connection is not left idle during the Bedrock call.
        db.commit()

        result: ExtractedInvoice | None = None
        error: str | None = None
        tries = 0
        for tries in range(1, MAX_EXTRACTION_TRIES + 1):
            try:
                data = _download(file_key)
                result = extractor.extract(data, mime_type, file_key=file_key, original_filename=filename)
                error = None
                break
            except ExtractionError as exc:
                error = str(exc)
            except Exception as exc:  # noqa: BLE001 - an invoice must never drop out of the queue (UC-1)
                logger.exception("Error tak terduga saat ekstraksi invoice %s", invoice_id)
                error = f"{type(exc).__name__}: {exc}"
            logger.warning("Ekstraksi invoice %s gagal (percobaan %s): %s", invoice_id, tries, error)

        # Reload the row: make sure this worker still owns the invoice before writing results.
        invoice = (
            db.query(Invoice)
            .filter(Invoice.id == invoice_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if invoice is None or invoice.status != InvoiceStatus.PROCESSING:
            db.rollback()
            return

        invoice.extraction_attempts = (invoice.extraction_attempts or 0) + tries
        if result is None:
            invoice.extraction_error = (error or "Ekstraksi gagal.")[:2000]
            apply_result(db, invoice, [EXTRACTION_FAILED], robot_id)
            outcome = EXTRACTION_FAILED
        elif not result.readable:
            invoice.extraction_result = result.model_dump(mode="json")
            invoice.extraction_error = "Model menandai dokumen tidak terbaca jelas."
            invoice.extracted_at = datetime.now(timezone.utc)
            apply_result(db, invoice, [UNREADABLE_DOCUMENT], robot_id)
            outcome = UNREADABLE_DOCUMENT
        else:
            _store_result(db, invoice, result)
            codes = run_validation(db, invoice, robot_id)
            outcome = invoice.status.value if not codes else ",".join(codes)
        db.commit()

    logger.info(
        "Ekstraksi invoice %s selesai dalam %.1f detik (%s percobaan): %s",
        invoice_id,
        time.monotonic() - started,
        tries,
        outcome,
    )


def _store_result(db: Session, invoice: Invoice, result: ExtractedInvoice) -> None:
    """Store the draft in invoices and invoice_items (EXT-02). Missing values stay empty (EXT-03)."""
    # Delete old rows first so unique (invoice_id, line_no) does not clash with the new rows.
    invoice.items.clear()
    db.flush()
    invoice.vendor_name = result.vendor_name
    invoice.invoice_number = result.invoice_number
    invoice.invoice_date = result.invoice_date
    invoice.bank_account = result.bank_account
    invoice.tax_amount = result.tax_amount
    invoice.discount_amount = result.discount_amount if result.discount_amount is not None else 0
    invoice.total_amount = result.total_amount
    invoice.items = [
        InvoiceItem(
            line_no=line_no,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            amount=item.amount,
        )
        # Renumber lines so they are unique and sequential even if the model repeats numbers.
        for line_no, item in enumerate(sorted(result.items, key=lambda i: i.line_no), start=1)
    ]
    invoice.extraction_result = result.model_dump(mode="json")
    invoice.extraction_error = None
    invoice.extracted_at = datetime.now(timezone.utc)
    db.flush()


def _download(file_key: str) -> bytes:
    try:
        response = get_s3_client().get_object(Bucket=settings.S3_BUCKET_NAME, Key=file_key)
        return response["Body"].read()
    except (ClientError, BotoCoreError) as exc:
        raise ExtractionError(f"Berkas tidak dapat diambil dari S3: {exc}") from exc


class ExtractionWorker:
    """Polling loop with a thread pool. wake() skips the poll wait after an upload."""

    def __init__(
        self,
        threads: int | None = None,
        poll_seconds: float | None = None,
        process_fn: Callable[[uuid.UUID], None] = process,
    ):
        self.threads = max(1, threads or settings.EXTRACTION_WORKER_THREADS)
        self.poll_seconds = poll_seconds if poll_seconds is not None else settings.EXTRACTION_POLL_SECONDS
        self.process_fn = process_fn
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._slots = threading.Semaphore(self.threads)
        self._executor: ThreadPoolExecutor | None = None
        self._thread: threading.Thread | None = None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self._executor = ThreadPoolExecutor(max_workers=self.threads, thread_name_prefix="extraction")
        self._thread = threading.Thread(target=self._loop, name="extraction-dispatcher", daemon=True)
        self._thread.start()
        logger.info("Worker ekstraksi berjalan: %s thread, mode %s", self.threads, settings.EXTRACTION_MODE)

    def stop(self, timeout: float = 30) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join(timeout)
        if self._executor is not None:
            self._executor.shutdown(wait=True, cancel_futures=True)
        self._thread = None
        self._executor = None
        logger.info("Worker ekstraksi berhenti.")

    def wake(self) -> None:
        self._wake.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            claimed_any = False
            # Claim as many jobs as there are free thread slots, then wait for a signal or the poll interval.
            while not self._stop.is_set() and self._slots.acquire(blocking=False):
                try:
                    with SessionLocal() as db:
                        invoice_id = claim_next(db)
                except Exception:  # noqa: BLE001 - the loop must survive the DB being temporarily unavailable
                    logger.exception("Gagal mengklaim antrean ekstraksi")
                    invoice_id = None
                if invoice_id is None:
                    self._slots.release()
                    break
                claimed_any = True
                self._executor.submit(self._run, invoice_id)
            if not claimed_any:
                self._wake.wait(self.poll_seconds)
                self._wake.clear()

    def _run(self, invoice_id: uuid.UUID) -> None:
        try:
            self.process_fn(invoice_id)
        except Exception:  # noqa: BLE001 - the invoice stays PROCESSING and is reclaimed once stale
            logger.exception("Worker gagal memproses invoice %s", invoice_id)
        finally:
            self._slots.release()
            self._wake.set()


extraction_worker = ExtractionWorker()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    stopped = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())
    extraction_worker.start()
    stopped.wait()
    extraction_worker.stop()


if __name__ == "__main__":
    main()
