import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from models.user import UserRole
from schemas.common import InternalEmail


MANAGEABLE_USER_ROLES = {
    UserRole.INTAKE,
    UserRole.FINANCE_REVIEWER,
    UserRole.SERVICE_LEAD,
    UserRole.SYSTEM_ADMIN,
}


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: InternalEmail
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Nama pengguna tidak boleh kosong.")
        return value

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: UserRole) -> UserRole:
        if value not in MANAGEABLE_USER_ROLES:
            raise ValueError("Role ROBOT_ADMIN tidak dapat diberikan kepada user.")
        return value


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: InternalEmail | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: UserRole | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Nama pengguna tidak boleh kosong.")
        return value

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: UserRole | None) -> UserRole | None:
        if value is not None and value not in MANAGEABLE_USER_ROLES:
            raise ValueError("Role ROBOT_ADMIN tidak dapat diberikan kepada user.")
        return value


class UserAdminResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: InternalEmail
    role: UserRole
    is_active: bool
    assigned_clients: list["UserClientSummary"] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class UserClientSummary(BaseModel):
    id: uuid.UUID
    code: str
    name: str


class UserListResponse(BaseModel):
    items: list[UserAdminResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    active_count: int
    inactive_count: int

