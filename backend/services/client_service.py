import uuid

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.client import Client
from schemas.client import ClientCreate, ClientUpdate


class ClientService:
    @staticmethod
    def list_clients(db: Session, skip: int = 0, limit: int = 100) -> list[Client]:
        return (
            db.query(Client)
            .order_by(Client.created_at.desc(), Client.id)
            .offset(skip)
            .limit(limit)
            .all()
        )

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
