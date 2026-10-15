import uuid
from sqlalchemy import Column, String, Boolean, DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID
from database import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True
    )
    name = Column(String(255), unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    def __repr__(self):
        return f"<Client id={self.id} name='{self.name}'>"
