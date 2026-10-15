import uuid
from enum import Enum
from sqlalchemy import Column, String, Boolean, DateTime, func, text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from database import Base


class UserRole(str, Enum):
    INTAKE = "INTAKE"
    FINANCE_REVIEWER = "FINANCE_REVIEWER"
    SERVICE_LEAD = "SERVICE_LEAD"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    ROBOT_ADMIN = "ROBOT_ADMIN"


class User(Base):
    __tablename__ = "users"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True
    )
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=True)
    role = Column(
        SQLEnum(UserRole, name="user_role"),
        nullable=False
    )
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
        return f"<User id={self.id} email='{self.email}' role='{self.role}'>"
