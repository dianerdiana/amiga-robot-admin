import uuid

from pydantic import BaseModel

from schemas.user import UserAdminResponse


class UserClientAssignmentCreate(BaseModel):
    user_id: uuid.UUID


class UserClientAssignmentResponse(BaseModel):
    user_id: uuid.UUID
    client_id: uuid.UUID


class ClientAssignmentListResponse(BaseModel):
    client_id: uuid.UUID
    users: list[UserAdminResponse]
