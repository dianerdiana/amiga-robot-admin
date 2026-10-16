import uuid
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class ChatSourceRef(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    uri: str | None = None
    score: float | None = None
    snippet: str | None = None


class ChatSessionCreate(BaseModel):
    title: str = Field(default="Percakapan baru", min_length=1, max_length=255)


class ChatSessionUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ChatSessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    source_refs: list[ChatSourceRef] | None = None
    created_at: datetime


class ChatSessionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageRead] = Field(default_factory=list)


class ChatTurnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: uuid.UUID
    message: ChatMessageRead
    answer: ChatMessageRead
    sources: list[ChatSourceRef] = Field(default_factory=list)
    model: str
    role_scope: str