import uuid
from enum import Enum

from pydantic import BaseModel, ConfigDict

from schemas.user import UserAdminResponse


class UserClientAssignmentCreate(BaseModel):
    user_id: uuid.UUID


class ReviewerAssignmentCreate(BaseModel):
    reviewer_id: uuid.UUID


class UserClientAssignmentResponse(BaseModel):
    user_id: uuid.UUID
    client_id: uuid.UUID


class ClientAssignmentListResponse(BaseModel):
    client_id: uuid.UUID
    users: list[UserAdminResponse]


class ReviewerAssignmentStatus(str, Enum):
    ASSIGNED = "ASSIGNED"
    UNASSIGNED = "UNASSIGNED"


class ActiveReviewerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str


class ClientReviewerResponse(BaseModel):
    client_id: uuid.UUID
    client_code: str
    client_name: str
    active_reviewers: list[ActiveReviewerResponse]
    assignment_status: ReviewerAssignmentStatus
