from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, UserRole
from schemas.auth import (
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserResponse,
    MessageResponse,
)
from services.auth_service import AuthService
from middlewares.auth_middleware import get_current_user, require_roles

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ==========================================
# 1. Route Otentikasi Utama
# ==========================================

@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Login pengguna",
    description="Mengotentikasi pengguna menggunakan email dan password, menghasilkan access_token dan refresh_token.",
)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    return AuthService.authenticate_user(db=db, login_data=request)


@router.post(
    "/refresh-token",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Perbarui access token",
    description="Menghasilkan access token baru menggunakan refresh token yang masih valid.",
)
def refresh_token(request: RefreshTokenRequest, db: Session = Depends(get_db)):
    return AuthService.refresh_access_token(
        db=db, refresh_token_str=request.refresh_token
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Ambil data profil pengguna yang login",
    description="Mengembalikan data profil lengkap dari pengguna yang sedang terotentikasi via Bearer token.",
)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ==========================================
# 2. Pengecekan Route Middleware Sederhana (RBAC Test)
# ==========================================

@router.get(
    "/test-role/finance-reviewer",
    response_model=MessageResponse,
    summary="Uji akses role FINANCE_REVIEWER",
    description="Endpoint yang hanya dapat diakses oleh pengguna dengan role FINANCE_REVIEWER.",
)
def test_finance_reviewer_access(
    user: User = Depends(require_roles(UserRole.FINANCE_REVIEWER)),
):
    return MessageResponse(
        message=f"Berhasil! Halo {user.name}, Anda memiliki akses sebagai FINANCE_REVIEWER.",
        detail={"user_id": str(user.id), "role": user.role.value},
    )


@router.get(
    "/test-role/intake",
    response_model=MessageResponse,
    summary="Uji akses role INTAKE",
    description="Endpoint yang hanya dapat diakses oleh pengguna dengan role INTAKE.",
)
def test_intake_access(
    user: User = Depends(require_roles(UserRole.INTAKE)),
):
    return MessageResponse(
        message=f"Berhasil! Halo {user.name}, Anda memiliki akses sebagai INTAKE.",
        detail={"user_id": str(user.id), "role": user.role.value},
    )


@router.get(
    "/test-role/admin-only",
    response_model=MessageResponse,
    summary="Uji akses role SYSTEM_ADMIN",
    description="Endpoint khusus untuk peran SYSTEM_ADMIN.",
)
def test_system_admin_access(
    user: User = Depends(require_roles(UserRole.SYSTEM_ADMIN)),
):
    return MessageResponse(
        message=f"Berhasil! Halo {user.name}, Anda memiliki akses penuh Administrator.",
        detail={"user_id": str(user.id), "role": user.role.value},
    )


@router.get(
    "/test-role/lead-or-admin",
    response_model=MessageResponse,
    summary="Uji akses multi-role (SERVICE_LEAD / SYSTEM_ADMIN)",
    description="Endpoint yang dapat diakses oleh SERVICE_LEAD atau SYSTEM_ADMIN.",
)
def test_multi_role_access(
    user: User = Depends(require_roles(UserRole.SERVICE_LEAD, UserRole.SYSTEM_ADMIN)),
):
    return MessageResponse(
        message=f"Berhasil! Halo {user.name}, Anda diizinkan masuk karena role Anda adalah {user.role.value}.",
        detail={"user_id": str(user.id), "role": user.role.value},
    )
