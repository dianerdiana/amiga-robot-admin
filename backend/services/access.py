import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.client import Client
from models.user import User, UserRole
from models.user_client import UserClient


REVOKED_ASSIGNMENT_MESSAGE = (
    "Penugasan Anda untuk klien ini telah dicabut atau tidak ditemukan. "
    "Hubungi koordinator Intake untuk pembaruan izin."
)


def assigned_client_ids(db: Session, user: User) -> list[uuid.UUID]:
    """Clients assigned to the user through the user_clients table (ACC-03)."""
    rows = (
        db.query(UserClient.client_id)
        .join(Client, Client.id == UserClient.client_id)
        .filter(UserClient.user_id == user.id, Client.is_active.is_(True))
        .all()
    )
    return [row.client_id for row in rows]


def assert_client_access(db: Session, user: User, client_id: uuid.UUID) -> None:
    """Reject with 403 when the user is not assigned to the client."""
    assigned = (
        db.query(UserClient)
        .join(Client, Client.id == UserClient.client_id)
        .filter(
            UserClient.user_id == user.id,
            UserClient.client_id == client_id,
            Client.is_active.is_(True),
        )
        .first()
    )
    if not assigned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=REVOKED_ASSIGNMENT_MESSAGE)


def clients_with_reviewer(db: Session, client_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Clients that have at least one active Finance Reviewer (ACC-06 indicator)."""
    if not client_ids:
        return set()
    rows = (
        db.query(UserClient.client_id)
        .join(User, User.id == UserClient.user_id)
        .filter(
            UserClient.client_id.in_(client_ids),
            User.role == UserRole.FINANCE_REVIEWER,
            User.is_active.is_(True),
        )
        .distinct()
        .all()
    )
    return {row.client_id for row in rows}
