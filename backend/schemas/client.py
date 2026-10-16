import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClientCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise ValueError("Kode klien tidak boleh kosong.")
        return value

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Nama klien tidak boleh kosong.")
        return value


class ClientUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip().upper()
        if not value:
            raise ValueError("Kode klien tidak boleh kosong.")
        return value

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Nama klien tidak boleh kosong.")
        return value


class ClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ClientAssignedUserSummary(BaseModel):
    id: uuid.UUID
    name: str
    email: str


class ClientListItemResponse(ClientResponse):
    active_reviewers: list[ClientAssignedUserSummary] = Field(default_factory=list)
    assigned_intake: list[ClientAssignedUserSummary] = Field(default_factory=list)


class ClientListResponse(BaseModel):
    items: list[ClientListItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    active_count: int
    inactive_count: int
    clients_with_reviewer: int
    clients_without_reviewer: int
    active_intake_staff: int
