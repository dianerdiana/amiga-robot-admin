import uuid

from sqlalchemy import case
from sqlalchemy.orm import Session

from core.config import settings
from models.audit_log import AuditLog
from models.user import User


# Rows written in one transaction share created_at; show them in a logical order (newest first):
# the correction reason, then the field changes, then the resulting validation and status.
_ACTION_ORDER = case(
    (AuditLog.action == "CORRECTION_NOTE", 0),
    (AuditLog.action.in_(("FIELD_UPDATED", "ITEM_ADDED", "ITEM_REMOVED")), 1),
    (AuditLog.action == "EXCEPTIONS_DETECTED", 2),
    (AuditLog.action == "STATUS_CHANGED", 3),
    else_=4,
)


class AuditService:
    @staticmethod
    def log(
        db: Session,
        *,
        entity_type: str,
        entity_id: uuid.UUID,
        action: str,
        user_id: uuid.UUID,
        field_name: str | None = None,
        old_value: object = None,
        new_value: object = None,
    ) -> AuditLog:
        """Add an audit entry to the caller's session without committing (AUD-04).

        The entry is saved or rolled back together with the data change it describes.
        """
        entry = AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            user_id=user_id,
            field_name=field_name,
            old_value=_to_text(old_value),
            new_value=_to_text(new_value),
        )
        db.add(entry)
        return entry

    @staticmethod
    def list_for(db: Session, entity_type: str, entity_id: uuid.UUID) -> list[tuple[AuditLog, User]]:
        return (
            db.query(AuditLog, User)
            .join(User, User.id == AuditLog.user_id)
            .filter(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
            .order_by(AuditLog.created_at.desc(), _ACTION_ORDER, AuditLog.id)
            .all()
        )


_robot_admin_ids: dict[str, uuid.UUID] = {}


def get_robot_admin_id(db: Session) -> uuid.UUID:
    """ID of the Robot Admin system account (AUD-02), seeded by migration c5a1d8e3f702.

    Cached per database URL so the worker does not query it for every job.
    """
    cache_key = db.get_bind().url.render_as_string(hide_password=True)
    if cache_key not in _robot_admin_ids:
        robot_id = db.query(User.id).filter(User.email == settings.ROBOT_ADMIN_EMAIL).scalar()
        if robot_id is None:
            raise RuntimeError(
                f"Akun Robot Admin ({settings.ROBOT_ADMIN_EMAIL}) tidak ditemukan. Jalankan `alembic upgrade head`."
            )
        _robot_admin_ids[cache_key] = robot_id
    return _robot_admin_ids[cache_key]


def _to_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        return ",".join(str(v) for v in value) if value else "NONE"
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)
