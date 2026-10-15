import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from database import get_db
from middlewares.auth_middleware import require_roles
from models.user import User, UserRole
from schemas.client import ClientCreate, ClientResponse, ClientUpdate
from services.client_service import ClientService


router = APIRouter(prefix="/clients", tags=["Client Management"])
system_admin_only = require_roles(UserRole.SYSTEM_ADMIN)


@router.get("", response_model=list[ClientResponse])
def list_clients(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return ClientService.list_clients(db, skip=skip, limit=limit)


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return ClientService.get_client(db, client_id)


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    request: ClientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return ClientService.create_client(db, request)


@router.put("/{client_id}", response_model=ClientResponse)
@router.patch("/{client_id}", response_model=ClientResponse, include_in_schema=False)
def update_client(
    client_id: uuid.UUID,
    request: ClientUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return ClientService.update_client(db, client_id, request)


@router.delete("/{client_id}", response_model=ClientResponse)
def deactivate_client(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    """Soft-delete klien untuk menjaga relasi dokumen dan histori."""
    return ClientService.deactivate_client(db, client_id)
