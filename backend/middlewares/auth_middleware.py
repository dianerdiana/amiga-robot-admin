import uuid
from typing import List, Sequence, Union
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models.user import User, UserRole
from core.security import decode_token

# Skema Bearer Token untuk header Authorization
security_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Union[HTTPAuthorizationCredentials, None] = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Middleware/Dependency untuk memverifikasi access token JWT
    dan mengembalikan entitas pengguna yang sedang login.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header otorisasi (Bearer Token) tidak ditemukan.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid atau sudah kedaluwarsa.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Pastikan tipe token adalah access token
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipe token tidak valid untuk autentikasi endpoint.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    subject = payload.get("sub")
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak memiliki informasi subjek.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(subject)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Format identifier pengguna pada token tidak valid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pengguna tidak ditemukan.",
        )

    # Validasi user aktif (ADM-01)
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Akun Anda sedang dinonaktifkan.",
        )

    return user


class RoleChecker:
    """
    Dependency class untuk memverifikasi role pengguna (RBAC).
    Mendukung satu atau beberapa role yang diizinkan.
    """

    def __init__(self, allowed_roles: Sequence[Union[UserRole, str]]):
        # Normalisasi enum ke format string
        self.allowed_roles = [
            r.value if isinstance(r, UserRole) else str(r)
            for r in allowed_roles
        ]

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        user_role_str = (
            current_user.role.value
            if hasattr(current_user.role, "value")
            else str(current_user.role)
        )

        if user_role_str not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Akses ditolak: Peran '{user_role_str}' tidak memiliki izin. "
                    f"Peran yang diizinkan: {', '.join(self.allowed_roles)}."
                ),
            )

        return current_user


def require_roles(*roles: Union[UserRole, str]) -> RoleChecker:
    """
    Helper function untuk membuat dependency RoleChecker dengan syntax praktis:
    `user: User = Depends(require_roles(UserRole.FINANCE_REVIEWER))`
    """
    return RoleChecker(roles)
