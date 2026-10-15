import uuid

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.security import hash_password
from models.user import User
from schemas.user import UserCreate, UserUpdate


class UserService:
    @staticmethod
    def list_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
        return (
            db.query(User)
            .order_by(User.created_at.desc(), User.id)
            .offset(skip)
            .limit(limit)
            .all()
        )

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

