from sqlalchemy import Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class UserClient(Base):
    __tablename__ = "user_clients"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        primary_key=True,
    )
