import uuid
from datetime import date
from enum import Enum

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from core.config import settings
from database import get_db
from middlewares.auth_middleware import require_roles
from models.invoice import InvoiceStatus
from models.user import User, UserRole
from schemas.invoice import (
    AssignedClient,
    AuditEntry,
    FileUrlResponse,
    InvoiceChannel,
    InvoiceDetail,
    InvoicePage,
    InvoiceUploadResponse,
)
from services.invoice_service import NO_REVIEWER_ISSUE, InvoiceService
from services.validation_service import EXCEPTION_MESSAGES
from workers.extraction_worker import extraction_worker


router = APIRouter(prefix="/invoices", tags=["Invoices"])
me_router = APIRouter(prefix="/me", tags=["Invoices"])
intake_only = require_roles(UserRole.INTAKE)

IssueFilter = Enum("IssueFilter", {code: code for code in [NO_REVIEWER_ISSUE, *EXCEPTION_MESSAGES]}, type=str)


@me_router.get("/clients", response_model=list[AssignedClient])
def list_my_clients(db: Session = Depends(get_db), user: User = Depends(intake_only)):
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
    user: User = Depends(intake_only),
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


@router.get("/{invoice_id}", response_model=InvoiceDetail)
def get_invoice(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_only)):
    return InvoiceService.get_detail(db, user, invoice_id)


@router.get("/{invoice_id}/file-url", response_model=FileUrlResponse)
def get_invoice_file_url(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_only)):
    return InvoiceService.get_file_url(db, user, invoice_id)


@router.get("/{invoice_id}/history", response_model=list[AuditEntry])
def get_invoice_history(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_only)):
    return InvoiceService.get_history(db, user, invoice_id)
