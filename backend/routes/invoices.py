import uuid
from datetime import date
from decimal import Decimal
from enum import Enum

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.config import settings
from database import get_db
from middlewares.auth_middleware import require_roles
from models.invoice import Invoice, InvoiceStatus
from models.user import User, UserRole
from schemas.invoice import (
    AssignedClient,
    AuditEntry,
    FileUrlResponse,
    InvoiceApproval,
    InvoiceChannel,
    InvoiceCorrection,
    InvoiceDetail,
    InvoicePage,
    InvoiceRejection,
    InvoiceUploadResponse,
)
from services.access import assert_client_access
from services.audit_service import AuditService
from services.invoice_service import NO_REVIEWER_ISSUE, InvoiceService
from services import validation_service as ValidationService
from services.validation_service import EXCEPTION_MESSAGES
from workers.extraction_worker import extraction_worker


router = APIRouter(prefix="/invoices", tags=["Invoices"])
me_router = APIRouter(prefix="/me", tags=["Invoices"])
intake_only = require_roles(UserRole.INTAKE)
reviewer_only = require_roles(UserRole.FINANCE_REVIEWER)
# Keep one alias shared by Intake and Reviewer endpoints; invoice_access retains our previous semantic name.
invoice_access = require_roles(UserRole.INTAKE, UserRole.FINANCE_REVIEWER)
intake_or_reviewer = invoice_access

IssueFilter = Enum("IssueFilter", {code: code for code in [NO_REVIEWER_ISSUE, *EXCEPTION_MESSAGES]}, type=str)


@me_router.get("/clients", response_model=list[AssignedClient])
def list_my_clients(db: Session = Depends(get_db), user: User = Depends(intake_or_reviewer)):
    """Clients assigned to the user, for the upload dropdown and queue filter."""
    return InvoiceService.list_assigned_clients(db, user)


@router.post("", response_model=InvoiceUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_invoice(
    client_id: uuid.UUID = Form(...),
    channel: InvoiceChannel = Form(...),
    request_date: date = Form(...),
    previous_request_id: uuid.UUID | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(intake_only),
):
    """Upload one invoice (UC-1). Extraction runs in the background; the response does not wait for the AI."""
    # Read one byte past the limit so oversized files are detected without reading the whole file.
    data = file.file.read(settings.UPLOAD_MAX_BYTES + 1)
    result = InvoiceService.upload_invoice(
        db,
        user,
        client_id=client_id,
        channel=channel,
        request_date=request_date,
        data=data,
        original_filename=file.filename or "invoice",
        previous_request_id=previous_request_id,
    )
    extraction_worker.wake()
    return result


@router.get("", response_model=InvoicePage)
def list_invoices(
    client_id: uuid.UUID | None = Query(default=None),
    status_filter: InvoiceStatus | None = Query(default=None, alias="status"),
    issue: IssueFilter | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(intake_or_reviewer),
):
    return InvoiceService.list_invoices(
        db,
        user,
        client_id=client_id,
        status_filter=status_filter,
        issue=issue.value if issue else None,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )


@router.get("/review-queue", response_model=InvoicePage)
def list_review_queue(
    status: list[InvoiceStatus] | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(reviewer_only),
):
    requested_statuses = status or list(DRAFT_STATUSES)
    return InvoiceService.list_review_queue(
        db,
        user,
        statuses=requested_statuses,
        skip=offset,
        limit=limit,
    )


@router.get("/{invoice_id}", response_model=InvoiceDetail)
def get_invoice(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_or_reviewer)):
    return InvoiceService.get_detail(db, user, invoice_id)


@router.put("/{invoice_id}", response_model=InvoiceDetail)
def correct_invoice(
    invoice_id: uuid.UUID,
    request: InvoiceCorrection,
    db: Session = Depends(get_db),
    user: User = Depends(intake_or_reviewer),
):
    """Correct extracted data (Intake or Finance Reviewer). Requires the loaded version and a reason; re-runs validation."""
    return InvoiceService.correct_invoice(db, user, invoice_id, request)


@router.post("/{invoice_id}/approve", response_model=InvoiceDetail)
def approve_invoice(
    invoice_id: uuid.UUID,
    request: InvoiceApproval,
    db: Session = Depends(get_db),
    user: User = Depends(reviewer_only),
):
    """Approve (UC-8): READY_FOR_REVIEW, or POSSIBLE_DUPLICATE with a justification note."""
    return InvoiceService.approve(db, user, invoice_id, request)


@router.post("/{invoice_id}/reject", response_model=InvoiceDetail)
def reject_invoice(
    invoice_id: uuid.UUID,
    request: InvoiceRejection,
    db: Session = Depends(get_db),
    user: User = Depends(reviewer_only),
):
    """Reject with a required note (UC-8). REJECTED is final."""
    return InvoiceService.reject(db, user, invoice_id, request)


@router.get("/{invoice_id}/file-url", response_model=FileUrlResponse)
def get_invoice_file_url(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_or_reviewer)):
    return InvoiceService.get_file_url(db, user, invoice_id)


@router.get("/{invoice_id}/history", response_model=list[AuditEntry])
def get_invoice_history(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_or_reviewer)):
    return InvoiceService.get_history(db, user, invoice_id)


class ReviewCorrectRequest(BaseModel):
    vendor_name: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    bank_account: str | None = None
    tax_amount: Decimal | None = None
    discount_amount: Decimal | None = None
    total_amount: Decimal | None = None
    expected_version: int | None = None


class ReviewApproveRequest(BaseModel):
    note: str | None = None
    expected_version: int | None = None


class ReviewRejectRequest(BaseModel):
    reject_note: str
    expected_version: int | None = None


DRAFT_STATUSES = (InvoiceStatus.READY_FOR_REVIEW, InvoiceStatus.EXCEPTION, InvoiceStatus.POSSIBLE_DUPLICATE)


def _ensure_reviewable(invoice: Invoice, user: User) -> None:
    if invoice.uploaded_by == user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Approver tidak boleh sama dengan uploader (SoD).",
        )
    if invoice.status not in DRAFT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice sudah difinalkan dan tidak dapat diubah.",
        )


DRAFT_STATUSES = (InvoiceStatus.READY_FOR_REVIEW, InvoiceStatus.EXCEPTION, InvoiceStatus.POSSIBLE_DUPLICATE)


@router.get("/{invoice_id}/review-detail", response_model=InvoiceDetail)
def get_review_invoice_detail(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(reviewer_only)):
    assert_client_access(db, user, db.get(Invoice, invoice_id).client_id)
    detail = InvoiceService.get_detail(db, user, invoice_id)
    return detail


@router.post("/{invoice_id}/correct", response_model=InvoiceDetail)
def correct_review_invoice(
    invoice_id: uuid.UUID,
    payload: ReviewCorrectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(reviewer_only),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice tidak ditemukan.")
    _ensure_reviewable(invoice, user)
    assert_client_access(db, user, invoice.client_id)

    if payload.expected_version is not None and invoice.version != payload.expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Versi invoice sudah berubah. Muat ulang lalu ulangi.")

    if payload.vendor_name is not None:
        AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="FIELD_CORRECTION", user_id=user.id, field_name="vendor_name", old_value=invoice.vendor_name, new_value=payload.vendor_name)
        invoice.vendor_name = payload.vendor_name
    if payload.invoice_number is not None:
        AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="FIELD_CORRECTION", user_id=user.id, field_name="invoice_number", old_value=invoice.invoice_number, new_value=payload.invoice_number)
        invoice.invoice_number = payload.invoice_number
    if payload.invoice_date is not None:
        AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="FIELD_CORRECTION", user_id=user.id, field_name="invoice_date", old_value=invoice.invoice_date, new_value=payload.invoice_date)
        invoice.invoice_date = payload.invoice_date
    if payload.bank_account is not None:
        AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="FIELD_CORRECTION", user_id=user.id, field_name="bank_account", old_value=invoice.bank_account, new_value=payload.bank_account)
        invoice.bank_account = payload.bank_account
    if payload.tax_amount is not None:
        AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="FIELD_CORRECTION", user_id=user.id, field_name="tax_amount", old_value=invoice.tax_amount, new_value=payload.tax_amount)
        invoice.tax_amount = payload.tax_amount
    if payload.discount_amount is not None:
        AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="FIELD_CORRECTION", user_id=user.id, field_name="discount_amount", old_value=invoice.discount_amount, new_value=payload.discount_amount)
        invoice.discount_amount = payload.discount_amount
    if payload.total_amount is not None:
        AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="FIELD_CORRECTION", user_id=user.id, field_name="total_amount", old_value=invoice.total_amount, new_value=payload.total_amount)
        invoice.total_amount = payload.total_amount

    codes = ValidationService.run_validation(db, invoice, user.id)
    db.commit()
    db.flush()
    return InvoiceService.get_detail(db, user, invoice_id)


@router.post("/{invoice_id}/approve", response_model=InvoiceDetail)
def approve_review_invoice(
    invoice_id: uuid.UUID,
    payload: ReviewApproveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(reviewer_only),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice tidak ditemukan.")
    _ensure_reviewable(invoice, user)
    assert_client_access(db, user, invoice.client_id)

    if payload.expected_version is not None and invoice.version != payload.expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Versi invoice sudah berubah. Muat ulang lalu ulangi.")

    old_status = invoice.status
    invoice.status = InvoiceStatus.AMIGA_REVIEWED
    invoice.reviewed_by = user.id
    invoice.reject_note = None
    invoice.version = (invoice.version or 1) + 1
    AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="APPROVED", user_id=user.id, field_name="status", old_value=old_status, new_value=invoice.status)
    db.commit()
    return InvoiceService.get_detail(db, user, invoice_id)


@router.post("/{invoice_id}/reject", response_model=InvoiceDetail)
def reject_review_invoice(
    invoice_id: uuid.UUID,
    payload: ReviewRejectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(reviewer_only),
):
    reject_note = payload.reject_note.strip()
    if not reject_note:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Catatan penolakan wajib diisi.")
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice tidak ditemukan.")
    _ensure_reviewable(invoice, user)
    assert_client_access(db, user, invoice.client_id)

    if payload.expected_version is not None and invoice.version != payload.expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Versi invoice sudah berubah. Muat ulang lalu ulangi.")

    old_status = invoice.status
    invoice.status = InvoiceStatus.REJECTED
    invoice.reviewed_by = user.id
    invoice.reject_note = reject_note
    invoice.version = (invoice.version or 1) + 1
    AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="REJECTED", user_id=user.id, field_name="status", old_value=old_status, new_value=invoice.status)
    AuditService.log(db, entity_type="invoice", entity_id=invoice.id, action="REJECT_NOTE", user_id=user.id, field_name="reject_note", old_value=None, new_value=payload.reject_note.strip())
    db.commit()
    return InvoiceService.get_detail(db, user, invoice_id)


@router.get("/{invoice_id}/audit", response_model=list[AuditEntry])
def get_review_invoice_audit(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(reviewer_only)):
    return InvoiceService.get_history(db, user, invoice_id)
