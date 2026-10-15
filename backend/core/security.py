from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import bcrypt
import jwt
from core.config import settings


def hash_password(password: str) -> str:
    """Hash password menggunakan bcrypt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifikasi password plain text dengan hashed password."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def create_token(
    subject: str,
    role: str,
    expires_delta: timedelta,
    token_type: str = "access"
) -> str:
    """Membuat JSON Web Token (JWT)."""
    now = datetime.now(timezone.utc)
    expire = now + expires_delta

    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": expire,
    }

    encoded_jwt = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def create_access_token(subject: str, role: str) -> str:
    """Membuat Access Token berumur pendek."""
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return create_token(subject=subject, role=role, expires_delta=expires_delta, token_type="access")


def create_refresh_token(subject: str, role: str) -> str:
    """Membuat Refresh Token berumur lebih panjang."""
    expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return create_token(subject=subject, role=role, expires_delta=expires_delta, token_type="refresh")


def decode_token(token: str) -> Optional[dict[str, Any]]:
    """Decode dan validasi JWT Token. Mengembalikan dict payload jika valid."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.PyJWTError:
        return None
