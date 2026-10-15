import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from database import get_db
from middlewares.auth_middleware import require_roles
from models.user import User, UserRole
from schemas.user import UserAdminResponse, UserCreate, UserUpdate
from services.user_service import UserService


router = APIRouter(prefix="/users", tags=["User Management"])
system_admin_only = require_roles(UserRole.SYSTEM_ADMIN)


@router.get("", response_model=list[UserAdminResponse])
def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return UserService.list_users(db, skip=skip, limit=limit)


@router.get("/{user_id}", response_model=UserAdminResponse)
def get_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return UserService.get_user(db, user_id)


@router.post("", response_model=UserAdminResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    request: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return UserService.create_user(db, request)


@router.put("/{user_id}", response_model=UserAdminResponse)
@router.patch("/{user_id}", response_model=UserAdminResponse, include_in_schema=False)
def update_user(
    user_id: uuid.UUID,
    request: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    return UserService.update_user(db, user_id, request)


@router.delete("/{user_id}", response_model=UserAdminResponse)
def deactivate_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    """Soft-delete user agar histori dan relasi data tetap terjaga."""
    return UserService.deactivate_user(db, user_id)

