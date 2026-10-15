import uuid

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.client import Client
from models.user import User, UserRole
from models.user_client import UserClient
from schemas.assignment import ReviewerAssignmentStatus


class AssignmentService:
    @staticmethod
    def get_client(db: Session, client_id: uuid.UUID) -> Client:
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Klien tidak ditemukan.")
        return client

    @staticmethod
    def get_user(db: Session, user_id: uuid.UUID) -> User:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pengguna tidak ditemukan.")
        return user

    @staticmethod
    def validate_assignment_permission(actor: User, assignee: User) -> None:
        if actor.role == UserRole.SYSTEM_ADMIN and assignee.role != UserRole.INTAKE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SYSTEM_ADMIN hanya dapat mengelola penugasan user berperan INTAKE.",
            )
        if actor.role == UserRole.SERVICE_LEAD and assignee.role != UserRole.FINANCE_REVIEWER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="SERVICE_LEAD hanya dapat mengelola penugasan user berperan FINANCE_REVIEWER.",
            )

    @staticmethod
    def list_assigned_users(db: Session, client_id: uuid.UUID) -> list[User]:
        AssignmentService.get_client(db, client_id)
        return (
            db.query(User)
            .join(UserClient, UserClient.user_id == User.id)
            .filter(UserClient.client_id == client_id)
            .order_by(User.name, User.id)
            .all()
        )

    @staticmethod
    def list_client_reviewers(db: Session, skip: int = 0, limit: int = 100) -> list[dict]:
        clients = (
            db.query(Client)
            .order_by(Client.code, Client.id)
            .offset(skip)
            .limit(limit)
            .all()
        )
        if not clients:
            return []

        client_ids = [client.id for client in clients]
        reviewer_rows = (
            db.query(UserClient.client_id, User)
            .join(User, User.id == UserClient.user_id)
            .filter(
                UserClient.client_id.in_(client_ids),
                User.role == UserRole.FINANCE_REVIEWER,
                User.is_active.is_(True),
            )
            .order_by(User.name, User.id)
            .all()
        )
        reviewers_by_client: dict[uuid.UUID, list[User]] = {client_id: [] for client_id in client_ids}
        for client_id, reviewer in reviewer_rows:
            reviewers_by_client[client_id].append(reviewer)

        result = []
        for client in clients:
            active_reviewers = reviewers_by_client[client.id]
            result.append(
                {
                    "client_id": client.id,
                    "client_code": client.code,
                    "client_name": client.name,
                    "active_reviewers": active_reviewers,
                    "assignment_status": (
                        ReviewerAssignmentStatus.ASSIGNED
                        if active_reviewers
                        else ReviewerAssignmentStatus.UNASSIGNED
                    ),
                }
            )
        return result

    @staticmethod
    def assign_user(db: Session, client_id: uuid.UUID, user_id: uuid.UUID, actor: User) -> UserClient:
        client = AssignmentService.get_client(db, client_id)
        user = AssignmentService.get_user(db, user_id)
        AssignmentService.validate_assignment_permission(actor, user)
        if not client.is_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Klien tidak aktif tidak dapat menerima penugasan.")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pengguna tidak aktif tidak dapat ditugaskan.")

        assignment = UserClient(user_id=user.id, client_id=client.id)
        db.add(assignment)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pengguna sudah ditugaskan ke klien ini.")
        return assignment

    @staticmethod
    def unassign_user(db: Session, client_id: uuid.UUID, user_id: uuid.UUID, actor: User) -> None:
        AssignmentService.get_client(db, client_id)
        user = AssignmentService.get_user(db, user_id)
        AssignmentService.validate_assignment_permission(actor, user)
        assignment = (
            db.query(UserClient)
            .filter(UserClient.client_id == client_id, UserClient.user_id == user_id)
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Penugasan pengguna tidak ditemukan.")
        db.delete(assignment)
        db.commit()
