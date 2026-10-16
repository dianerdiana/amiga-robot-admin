import math
import uuid

from fastapi import HTTPException, status
from sqlalchemy import String, cast, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.security import hash_password
from models.client import Client
from models.user import User
from models.user_client import UserClient
from schemas.user import MANAGEABLE_USER_ROLES, UserCreate, UserUpdate


class UserService:
    @staticmethod
    def list_users(
        db: Session,
        page: int = 1,
        page_size: int = 10,
        search: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
    ) -> dict:
        manageable_roles = tuple(MANAGEABLE_USER_ROLES)
        query = db.query(User).filter(User.role.in_(manageable_roles))
        keyword = search.strip() if search else ""
        if keyword:
            pattern = f"%{keyword}%"
            query = query.filter(
                or_(
                    User.name.ilike(pattern),
                    User.email.ilike(pattern),
                    cast(User.id, String).ilike(pattern),
                )
            )
        if role:
            query = query.filter(User.role == role)
        if is_active is not None:
            query = query.filter(User.is_active.is_(is_active))

        total = query.count()
        users = (
            query.order_by(User.created_at.desc(), User.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        assignments_by_user: dict[uuid.UUID, list[dict]] = {
            user.id: [] for user in users
        }
        if users:
            rows = (
                db.query(UserClient.user_id, Client.id, Client.code, Client.name)
                .join(Client, Client.id == UserClient.client_id)
                .filter(UserClient.user_id.in_([user.id for user in users]))
                .order_by(Client.name, Client.id)
                .all()
            )
            for user_id, client_id, code, name in rows:
                assignments_by_user[user_id].append(
                    {"id": client_id, "code": code, "name": name}
                )

        items = [
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": user.role,
                "is_active": user.is_active,
                "assigned_clients": assignments_by_user[user.id],
                "created_at": user.created_at,
                "updated_at": user.updated_at,
            }
            for user in users
        ]
        active_count = (
            db.query(func.count(User.id))
            .filter(User.role.in_(manageable_roles), User.is_active.is_(True))
            .scalar()
            or 0
        )
        inactive_count = (
            db.query(func.count(User.id))
            .filter(User.role.in_(manageable_roles), User.is_active.is_(False))
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
            "inactive_count": inactive_count,
        }

    @staticmethod
    def get_user(db: Session, user_id: uuid.UUID) -> User:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pengguna tidak ditemukan.",
            )
        return user

    @staticmethod
    def _ensure_unique_email(
        db: Session, email: str, excluded_user_id: uuid.UUID | None = None
    ) -> None:
        query = db.query(User).filter(func.lower(User.email) == email.lower())
        if excluded_user_id is not None:
            query = query.filter(User.id != excluded_user_id)
        if query.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email sudah digunakan oleh pengguna lain.",
            )

    @staticmethod
    def create_user(db: Session, data: UserCreate) -> User:
        email = str(data.email).strip().lower()
        UserService._ensure_unique_email(db, email)
        user = User(
            name=data.name,
            email=email,
            password_hash=hash_password(data.password),
            role=data.role,
            is_active=data.is_active,
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email sudah digunakan oleh pengguna lain.",
            )
        db.refresh(user)
        return user

    @staticmethod
    def update_user(db: Session, user_id: uuid.UUID, data: UserUpdate) -> User:
        user = UserService.get_user(db, user_id)
        changes = data.model_dump(exclude_unset=True)

        if "email" in changes and changes["email"] is not None:
            email = str(changes.pop("email")).strip().lower()
            UserService._ensure_unique_email(db, email, user.id)
            user.email = email
        if "password" in changes:
            password = changes.pop("password")
            if password is not None:
                user.password_hash = hash_password(password)
        for field, value in changes.items():
            if value is not None:
                setattr(user, field, value)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email sudah digunakan oleh pengguna lain.",
            )
        db.refresh(user)
        return user

    @staticmethod
    def deactivate_user(db: Session, user_id: uuid.UUID) -> User:
        user = UserService.get_user(db, user_id)
        user.is_active = False
        db.commit()
        db.refresh(user)
        return user

