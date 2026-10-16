import math
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.client import Client
from models.user import User, UserRole
from models.user_client import UserClient
from schemas.client import ClientCreate, ClientUpdate


class ClientService:
    @staticmethod
    def list_clients(
        db: Session,
        page: int = 1,
        page_size: int = 10,
        search: str | None = None,
        is_active: bool | None = None,
        reviewer_status: str | None = None,
        intake_status: str | None = None,
    ) -> dict:
        active_reviewer_exists = (
            db.query(UserClient.user_id)
            .join(User, User.id == UserClient.user_id)
            .filter(
                UserClient.client_id == Client.id,
                User.role == UserRole.FINANCE_REVIEWER,
                User.is_active.is_(True),
            )
            .exists()
        )
        active_intake_count = (
            select(func.count(UserClient.user_id))
            .select_from(UserClient)
            .join(User, User.id == UserClient.user_id)
            .where(
                UserClient.client_id == Client.id,
                User.role == UserRole.INTAKE,
                User.is_active.is_(True),
            )
            .correlate(Client)
            .scalar_subquery()
        )

        query = db.query(Client)
        keyword = search.strip() if search else ""
        if keyword:
            pattern = f"%{keyword}%"
            query = query.filter(or_(Client.code.ilike(pattern), Client.name.ilike(pattern)))
        if is_active is not None:
            query = query.filter(Client.is_active.is_(is_active))
        if reviewer_status == "assigned":
            query = query.filter(active_reviewer_exists)
        elif reviewer_status == "unassigned":
            query = query.filter(~active_reviewer_exists)
        if intake_status == "none":
            query = query.filter(active_intake_count == 0)
        elif intake_status == "single":
            query = query.filter(active_intake_count == 1)
        elif intake_status == "complete":
            query = query.filter(active_intake_count > 1)

        total = query.count()
        clients = (
            query.order_by(Client.created_at.desc(), Client.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        assignments: dict[uuid.UUID, dict[str, list[dict]]] = {
            client.id: {"active_reviewers": [], "assigned_intake": []}
            for client in clients
        }
        if clients:
            rows = (
                db.query(UserClient.client_id, User)
                .join(User, User.id == UserClient.user_id)
                .filter(
                    UserClient.client_id.in_([client.id for client in clients]),
                    User.is_active.is_(True),
                    User.role.in_((UserRole.INTAKE, UserRole.FINANCE_REVIEWER)),
                )
                .order_by(User.name, User.id)
                .all()
            )
            for client_id, user in rows:
                key = "active_reviewers" if user.role == UserRole.FINANCE_REVIEWER else "assigned_intake"
                assignments[client_id][key].append(
                    {"id": user.id, "name": user.name, "email": user.email}
                )

        items = [
            {
                "id": client.id,
                "code": client.code,
                "name": client.name,
                "is_active": client.is_active,
                "created_at": client.created_at,
                "updated_at": client.updated_at,
                **assignments[client.id],
            }
            for client in clients
        ]
        total_clients = db.query(func.count(Client.id)).scalar() or 0
        active_count = db.query(func.count(Client.id)).filter(Client.is_active.is_(True)).scalar() or 0
        clients_with_reviewer = db.query(func.count(Client.id)).filter(active_reviewer_exists).scalar() or 0
        active_intake_staff = (
            db.query(func.count(User.id))
            .filter(User.role == UserRole.INTAKE, User.is_active.is_(True))
            .scalar()
            or 0
        )
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": math.ceil(total / page_size) if total else 0,
            "active_count": active_count,
            "inactive_count": total_clients - active_count,
            "clients_with_reviewer": clients_with_reviewer,
            "clients_without_reviewer": total_clients - clients_with_reviewer,
            "active_intake_staff": active_intake_staff,
        }

    @staticmethod
    def get_client(db: Session, client_id: uuid.UUID) -> Client:
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Klien tidak ditemukan.",
            )
        return client

    @staticmethod
    def _ensure_unique(
        db: Session,
        *,
        code: str | None = None,
        name: str | None = None,
        excluded_client_id: uuid.UUID | None = None,
    ) -> None:
        if code is not None:
            query = db.query(Client).filter(func.lower(Client.code) == code.lower())
            if excluded_client_id is not None:
                query = query.filter(Client.id != excluded_client_id)
            if query.first():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Kode klien sudah digunakan.")

        if name is not None:
            query = db.query(Client).filter(func.lower(Client.name) == name.lower())
            if excluded_client_id is not None:
                query = query.filter(Client.id != excluded_client_id)
            if query.first():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nama klien sudah digunakan.")

    @staticmethod
    def create_client(db: Session, data: ClientCreate) -> Client:
        ClientService._ensure_unique(db, code=data.code, name=data.name)
        client = Client(**data.model_dump())
        db.add(client)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Kode atau nama klien sudah digunakan.")
        db.refresh(client)
        return client

    @staticmethod
    def update_client(db: Session, client_id: uuid.UUID, data: ClientUpdate) -> Client:
        client = ClientService.get_client(db, client_id)
        changes = data.model_dump(exclude_unset=True)
        ClientService._ensure_unique(
            db,
            code=changes.get("code"),
            name=changes.get("name"),
            excluded_client_id=client.id,
        )
        for field, value in changes.items():
            setattr(client, field, value)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Kode atau nama klien sudah digunakan.")
        db.refresh(client)
        return client

    @staticmethod
    def deactivate_client(db: Session, client_id: uuid.UUID) -> Client:
        client = ClientService.get_client(db, client_id)
        client.is_active = False
        db.commit()
        db.refresh(client)
        return client
