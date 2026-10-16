import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from database import get_db
from middlewares.auth_middleware import require_roles
from models.user import User, UserRole
from schemas.assignment import (
    ClientAssignmentListResponse,
    ClientReviewerListResponse,
    ReviewerAssignmentCreate,
    ReviewerOptionResponse,
    UserClientAssignmentCreate,
    UserClientAssignmentResponse,
)
from schemas.client import ClientCreate, ClientListResponse, ClientResponse, ClientUpdate
from services.assignment_service import AssignmentService
from services.client_service import ClientService


router = APIRouter(prefix="/clients", tags=["Client Management"])
system_admin_only = require_roles(UserRole.SYSTEM_ADMIN)
assignment_manager_only = require_roles(UserRole.SYSTEM_ADMIN, UserRole.SERVICE_LEAD)
service_lead_only = require_roles(UserRole.SERVICE_LEAD)


@router.get("", response_model=ClientListResponse)
def list_clients(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=255),
    is_active: bool | None = Query(default=None),
    reviewer_status: Literal["assigned", "unassigned"] | None = Query(default=None),
    intake_status: Literal["none", "single", "complete"] | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return ClientService.list_clients(
        db,
        page=page,
        page_size=page_size,
        search=search,
        is_active=is_active,
        reviewer_status=reviewer_status,
        intake_status=intake_status,
    )


@router.get("/reviewer-assignments", response_model=ClientReviewerListResponse)
def list_client_reviewers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=255),
    assignment_status: Literal["ASSIGNED", "UNASSIGNED"] | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(service_lead_only),
):
    """Daftar klien beserta reviewer aktif dan status penugasannya."""
    return AssignmentService.list_client_reviewers(
        db,
        page=page,
        page_size=page_size,
        search=search,
        assignment_status=assignment_status,
    )


@router.get("/reviewer-options", response_model=list[ReviewerOptionResponse])
def list_reviewer_options(
    db: Session = Depends(get_db),
    _: User = Depends(service_lead_only),
):
    """Reviewer aktif yang dapat dipilih oleh Service Lead."""
    return AssignmentService.list_active_reviewers(db)


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


@router.get("/{client_id}/assignments", response_model=ClientAssignmentListResponse)
def list_client_assignments(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(assignment_manager_only),
):
    return {"client_id": client_id, "users": AssignmentService.list_assigned_users(db, client_id)}


@router.post(
    "/{client_id}/assignments",
    response_model=UserClientAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_user_to_client(
    client_id: uuid.UUID,
    request: UserClientAssignmentCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(assignment_manager_only),
):
    return AssignmentService.assign_user(db, client_id, request.user_id, actor)


@router.post(
    "/{client_id}/reviewers",
    response_model=UserClientAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_reviewer_to_client(
    client_id: uuid.UUID,
    request: ReviewerAssignmentCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(service_lead_only),
):
    """Tugaskan user FINANCE_REVIEWER aktif kepada klien aktif."""
    return AssignmentService.assign_user(db, client_id, request.reviewer_id, actor)


@router.delete("/{client_id}/assignments/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_user_from_client(
    client_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(assignment_manager_only),
):
    AssignmentService.unassign_user(db, client_id, user_id, actor)
