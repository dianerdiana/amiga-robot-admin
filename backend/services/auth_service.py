import uuid
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from models.user import User
from schemas.auth import LoginRequest, TokenResponse
from core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from core.config import settings


class AuthService:
    @staticmethod
    def authenticate_user(db: Session, login_data: LoginRequest) -> TokenResponse:
        """
        Memvalidasi kredensial pengguna dan mengembalikan access token serta refresh token.
        """
        # Cari user berdasarkan email
        user = db.query(User).filter(User.email == login_data.email).first()

        if not user or not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email atau password tidak valid.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Cek kecocokan password
        if not verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email atau password tidak valid.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Cek status aktif user (ADM-01)
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akun ini telah dinonaktifkan. Silakan hubungi System Admin.",
            )

        user_id_str = str(user.id)
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)

        access_token = create_access_token(subject=user_id_str, role=role_str)
        refresh_token = create_refresh_token(subject=user_id_str, role=role_str)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    @staticmethod
    def refresh_access_token(db: Session, refresh_token_str: str) -> TokenResponse:
        """
        Memvalidasi refresh token dan menerbitkan access token baru.
        """
        payload = decode_token(refresh_token_str)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token tidak valid atau sudah kedaluwarsa.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token_type = payload.get("type")
        if token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tipe token tidak sesuai. Diperlukan refresh token.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        subject = payload.get("sub")
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token tidak memiliki subjek pengguna.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            user_uuid = uuid.UUID(subject)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Format ID pengguna di token tidak valid.",
            )

        user = db.query(User).filter(User.id == user_uuid).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pengguna terkait token tidak ditemukan.",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akun ini telah dinonaktifkan.",
            )

        user_id_str = str(user.id)
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)

        new_access_token = create_access_token(subject=user_id_str, role=role_str)
        # Opsi: Perpanjang refresh token juga
        new_refresh_token = create_refresh_token(subject=user_id_str, role=role_str)

        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
