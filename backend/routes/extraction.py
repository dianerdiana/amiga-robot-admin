import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from middlewares.auth_middleware import require_roles
from models.user import User, UserRole
from schemas.invoice import ExtractionStatus
from services.invoice_service import InvoiceService
from workers.extraction_worker import extraction_worker


router = APIRouter(prefix="/invoices/{invoice_id}/extraction", tags=["Extraction"])
intake_only = require_roles(UserRole.INTAKE)


@router.get("", response_model=ExtractionStatus)
def get_extraction(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_only)):
    """Status and structured AI extraction result (ExtractedInvoice), polled by the frontend."""
    return InvoiceService.get_extraction(db, user, invoice_id)


@router.post("", response_model=ExtractionStatus, status_code=status.HTTP_202_ACCEPTED)
def requeue_extraction(invoice_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_only)):
    """Re-queue extraction for invoices with EXTRACTION_FAILED or UNREADABLE_DOCUMENT."""
    result = InvoiceService.requeue_extraction(db, user, invoice_id)
    extraction_worker.wake()
    return result
