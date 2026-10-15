import json
import uuid
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from database import get_db
from middlewares.auth_middleware import get_current_user, require_roles
from models.audit_log import AuditLog
from models.client import Client
from models.invoice import Invoice, InvoiceStatus
from models.invoice_item import InvoiceItem
from models.user import User, UserRole
from models.user_client import UserClient
from schemas.invoice import (
    AuditLogResponse,
    InvoiceApproveRequest,
    InvoiceCorrectRequest,
    InvoiceRejectRequest,
    InvoiceResponse,
    InvoiceItemResponse,
    FINAL_STATUS_VALUES,
    REVIEW_STATUS_VALUES,
)

router = APIRouter(prefix="/invoices", tags=["Invoice Review"])


def _to_float(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _assigned_client_ids(db: Session, user: User) -> set[uuid.UUID]:
    rows = db.query(UserClient.client_id).filter(UserClient.user_id == user.id).all()
    return {row[0] for row in rows}


def _ensure_review_access(
    db: Session,
    invoice_id: uuid.UUID,
    current_user: User,
) -> Invoice:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice tidak ditemukan.",
        )

    role = (
        current_user.role.value
        if hasattr(current_user.role, "value")
        else str(current_user.role)
    )

    # SYSTEM_ADMIN secara bisnis tidak mengakses invoice;
    # pada implementasi ini reviewer adalah role resmi untuk queue ini.
    if role != UserRole.FINANCE_REVIEWER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Hanya Finance Reviewer yang dapat melakukan review invoice.",
        )

    allowed_clients = _assigned_client_ids(db, current_user)
    if invoice.client_id not in allowed_clients:
        # Gunakan 404 agar tidak bocor informasi ke klien lain.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice tidak ditemukan.",
        )

    return invoice


def _serialize_invoice(db: Session, invoice: Invoice) -> InvoiceResponse:
    client = db.query(Client).filter(Client.id == invoice.client_id).first()
    reviewer = None
    if invoice.reviewed_by is not None:
        reviewer = db.query(User).filter(User.id == invoice.reviewed_by).first()

    items = [
        InvoiceItemResponse(
            id=str(item.id),
            invoice_id=str(item.invoice_id),
            line_no=item.line_no,
            description=item.description,
            quantity=_to_float(item.quantity),
            unit_price=_to_float(item.unit_price),
            amount=_to_float(item.amount),
        )
        for item in sorted(invoice.items, key=lambda x: x.line_no)
    ]

    status_value = (
        invoice.status.value
        if hasattr(invoice.status, "value")
        else str(invoice.status)
    )
    exception_codes = list(invoice.exception_codes or [])

    return InvoiceResponse(
        id=str(invoice.id),
        request_id=invoice.request_id,
        client_id=str(invoice.client_id),
        client_name=client.name if client else None,
        uploaded_by=str(invoice.uploaded_by),
        reviewed_by=str(invoice.reviewed_by) if invoice.reviewed_by else None,
        reviewed_by_name=reviewer.name if reviewer else None,
        voucher_id=str(invoice.voucher_id) if invoice.voucher_id else None,
        previous_request_id=(
            str(invoice.previous_request_id) if invoice.previous_request_id else None
        ),
        request_type=invoice.request_type,
        channel=invoice.channel,
        request_date=invoice.request_date,
        vendor_name=invoice.vendor_name,
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        bank_account=invoice.bank_account,
        tax_amount=_to_float(invoice.tax_amount),
        discount_amount=_to_float(invoice.discount_amount) or 0.0,
        total_amount=_to_float(invoice.total_amount),
        file_key=invoice.file_key,
        original_filename=invoice.original_filename,
        mime_type=invoice.mime_type,
        status=status_value,
        exception_codes=exception_codes,
        reject_note=invoice.reject_note,
        version=invoice.version,
        created_at=invoice.created_at,
        updated_at=None,
        items=items,
    )


def _check_version(invoice: Invoice, expected_version: Optional[int]) -> None:
    if expected_version is not None and invoice.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Konflik versi: data invoice sudah berubah "
                f"(versi saat ini {invoice.version}, expected {expected_version})."
            ),
        )


def _add_audit(
    db: Session,
    entity_id: uuid.UUID,
    action: str,
    user_id: uuid.UUID,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> None:
    log = AuditLog(
        entity_type="invoice",
        entity_id=entity_id,
        action=action,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        user_id=user_id,
    )
    db.add(log)


@router.get("", response_model=List[InvoiceResponse])
def list_review_queue(
    status_filter: Optional[List[str]] = Query(
        default=None,
        alias="status",
        description="Filter status invoice (boleh berulang)",
    ),
    client_id: Optional[uuid.UUID] = Query(default=None, description="Filter klien ditugaskan"),
    limit: int = Query(10, ge=1, le=100, description="Jumlah item per halaman"),
    offset: int = Query(0, ge=0, description="Offset halaman"),
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_REVIEWER)),
):
    allowed_clients = _assigned_client_ids(db, current_user)
    if not allowed_clients:
        return []

    query = db.query(Invoice).filter(Invoice.client_id.in_(allowed_clients))

    if client_id is not None:
        if client_id not in allowed_clients:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ke klien ini tidak diizinkan.",
            )
        query = query.filter(Invoice.client_id == client_id)

    if status_filter:
        query = query.filter(Invoice.status.in_(status_filter))
    else:
        query = query.filter(Invoice.status.in_(REVIEW_STATUS_VALUES))

    total = query.count()

    invoices = (
        query.order_by(Invoice.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for invoice in invoices:
        invoice.items  # ensure relationship loaded
        result.append(_serialize_invoice(db, invoice))

    if response is not None:
        response.headers["X-Total-Count"] = str(total)

    return result


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice_detail(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_REVIEWER)),
):
    invoice = _ensure_review_access(db, invoice_id, current_user)
    invoice.items  # ensure relationship loaded
    return _serialize_invoice(db, invoice)


@router.post("/{invoice_id}/approve", response_model=InvoiceResponse)
def approve_invoice(
    invoice_id: uuid.UUID,
    payload: InvoiceApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_REVIEWER)),
):
    invoice = _ensure_review_access(db, invoice_id, current_user)

    current_status = (
        invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status)
    )
    if current_status in FINAL_STATUS_VALUES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice dengan status {current_status} tidak bisa disetujui ulang.",
        )

    # Segregation of Duties: approver != uploader
    if invoice.uploaded_by == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Approver tidak boleh sama dengan pengunggah invoice (SoD).",
        )

    _check_version(invoice, payload.expected_version)

    old_status = current_status
    invoice.reviewed_by = current_user.id
    invoice.status = InvoiceStatus.AMIGA_REVIEWED
    invoice.version += 1

    _add_audit(
        db,
        entity_id=invoice.id,
        action="APPROVE_INVOICE",
        user_id=current_user.id,
        old_value=old_status,
        new_value=InvoiceStatus.AMIGA_REVIEWED.value,
    )
    if payload.note:
        _add_audit(
            db,
            entity_id=invoice.id,
            action="REVIEW_NOTE",
            user_id=current_user.id,
            new_value=payload.note,
        )

    db.commit()
    db.refresh(invoice)
    invoice.items  # ensure relationship loaded
    return _serialize_invoice(db, invoice)


@router.post("/{invoice_id}/reject", response_model=InvoiceResponse)
def reject_invoice(
    invoice_id: uuid.UUID,
    payload:InvoiceRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_REVIEWER)),
):
    invoice = _ensure_review_access(db, invoice_id, current_user)

    current_status = (
        invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status)
    )
    if current_status in FINAL_STATUS_VALUES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice dengan status {current_status} tidak bisa ditolak ulang.",
        )

    if invoice.uploaded_by == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Reviewer tidak boleh sama dengan pengunggah invoice (SoD).",
        )

    _check_version(invoice, payload.expected_version)

    invoice.reviewed_by = current_user.id
    invoice.status = InvoiceStatus.REJECTED
    invoice.reject_note = payload.reject_note
    invoice.version += 1

    _add_audit(
        db,
        entity_id=invoice.id,
        action="REJECT_INVOICE",
        user_id=current_user.id,
        old_value=current_status,
        new_value=InvoiceStatus.REJECTED.value,
    )
    _add_audit(
        db,
        entity_id=invoice.id,
        action="REJECT_NOTE",
        user_id=current_user.id,
        new_value=payload.reject_note,
    )

    db.commit()
    db.refresh(invoice)
    invoice.items  # ensure relationship loaded
    return _serialize_invoice(db, invoice)


@router.post("/{invoice_id}/correct", response_model=InvoiceResponse)
def correct_invoice(
    invoice_id: uuid.UUID,
    payload: InvoiceCorrectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_REVIEWER)),
):
    invoice = _ensure_review_access(db, invoice_id, current_user)

    current_status = (
        invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status)
    )
    if current_status in FINAL_STATUS_VALUES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice dengan status {current_status} tidak bisa dikoreksi.",
        )

    if invoice.uploaded_by == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Korrektor tidak boleh sama dengan pengunggah invoice (SoD).",
        )

    _check_version(invoice, payload.expected_version)

    changes = {}
    field_map = {
        "vendor_name": ("vendor_name", invoice.vendor_name),
        "invoice_number": ("invoice_number", invoice.invoice_number),
        "invoice_date": ("invoice_date", invoice.invoice_date),
        "bank_account": ("bank_account", invoice.bank_account),
        "tax_amount": ("tax_amount", invoice.tax_amount),
        "discount_amount": ("discount_amount", invoice.discount_amount),
        "total_amount": ("total_amount", invoice.total_amount),
    }

    for field, value in (
        ("vendor_name", payload.vendor_name),
        ("invoice_number", payload.invoice_number),
        ("invoice_date", payload.invoice_date),
        ("bank_account", payload.bank_account),
        ("tax_amount", payload.tax_amount),
        ("discount_amount", payload.discount_amount),
        ("total_amount", payload.total_amount),
    ):
        if value is None:
            continue

        old_value = getattr(invoice, field)
        if old_value != value:
            setattr(invoice, field, value)
            changes[field] = {"old": old_value, "new": value}

    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tidak ada field yang berubah.",
        )

    invoice.version += 1

    _add_audit(
        db,
        entity_id=invoice.id,
        action="CORRECT_INVOICE",
        user_id=current_user.id,
        field_name=None,
        old_value=json.dumps(
            {k: str(v["old"]) for k, v in changes.items()}, ensure_ascii=False
        ),
        new_value=json.dumps(
            {k: str(v["new"]) for k, v in changes.items()}, ensure_ascii=False
        ),
    )

    db.commit()
    db.refresh(invoice)
    invoice.items  # ensure relationship loaded
    return _serialize_invoice(db, invoice)


@router.get("/{invoice_id}/audit", response_model=List[AuditLogResponse])
def get_invoice_audit(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.FINANCE_REVIEWER)),
):
    invoice = _ensure_review_access(db, invoice_id, current_user)

    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "invoice",
            AuditLog.entity_id == invoice.id,
        )
        .order_by(AuditLog.created_at.asc())
        .all()
    )

    result: List[AuditLogResponse] = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first()
        result.append(
            AuditLogResponse(
                id=str(log.id),
                entity_type=log.entity_type,
                entity_id=str(log.entity_id),
                action=log.action,
                field_name=log.field_name,
                old_value=log.old_value,
                new_value=log.new_value,
                user_id=str(log.user_id),
                user_name=user.name if user else None,
                created_at=log.created_at,
            )
        )
    return result