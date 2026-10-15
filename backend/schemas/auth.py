import uuid
from datetime import datetime
from pydantic import BaseModel
from models.user import UserRole
from schemas.common import InternalEmail


class LoginRequest(BaseModel):
    email: InternalEmail
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    message: str
    detail: dict | None = None
