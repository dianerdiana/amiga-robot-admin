import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from database import get_db
from middlewares.auth_middleware import require_roles
from models.user import User, UserRole
from schemas.voucher import EligibleInvoice, VoucherCreate, VoucherDetail, VoucherDownload, VoucherPage, VoucherVendor
from services.voucher_service import VoucherService


router = APIRouter(prefix="/vouchers", tags=["Vouchers"])
# Only Intake builds, lists, and downloads vouchers; client isolation is checked per request.
intake_only = require_roles(UserRole.INTAKE)


@router.get("/vendors", response_model=list[VoucherVendor])
def list_voucher_vendors(
    client_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(intake_only),
):
    """Vendors with AMIGA_REVIEWED invoices that have no voucher yet (VCH-01)."""
    return VoucherService.list_vendors(db, user, client_id)


@router.get("/eligible-invoices", response_model=list[EligibleInvoice])
def list_eligible_invoices(
    client_id: uuid.UUID = Query(...),
    vendor_key: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
    user: User = Depends(intake_only),
):
    """Invoices that can be put in a voucher for one client and vendor (VCH-02)."""
    return VoucherService.list_eligible_invoices(db, user, client_id, vendor_key)


@router.get("", response_model=VoucherPage)
def list_vouchers(
    client_id: uuid.UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(intake_only),
):
    """Vouchers of the assigned clients, newest first (UC-10)."""
    return VoucherService.list_vouchers(db, user, client_id=client_id, skip=skip, limit=limit)


@router.post("", response_model=VoucherDetail, status_code=status.HTTP_201_CREATED)
def create_voucher(request: VoucherCreate, db: Session = Depends(get_db), user: User = Depends(intake_only)):
    """Create a voucher atomically: lock, re-check, number, PDF to S3, VOUCHERED, audit (VCH-07)."""
    return VoucherService.create(db, user, request)


@router.get("/{voucher_id}", response_model=VoucherDetail)
def get_voucher(voucher_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_only)):
    return VoucherService.get_detail(db, user, voucher_id)


@router.post("/{voucher_id}/download", response_model=VoucherDownload)
def download_voucher(voucher_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(intake_only)):
    """Short-lived PDF link (VCH-11). The first download sets SENT_TO_CLIENT (VCH-12); every download is audited."""
    return VoucherService.download(db, user, voucher_id)
