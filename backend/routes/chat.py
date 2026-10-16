import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from middlewares.auth_middleware import get_current_user
from models.user import User
from schemas.chat import (
    ChatMessageCreate,
    ChatMessageRead,
    ChatSessionCreate,
    ChatSessionDetail,
    ChatSessionSummary,
    ChatTurnResponse,
)
from services.audit_service import AuditService
from services.chatbot_service import ChatbotService

router = APIRouter(prefix="/chat", tags=["Chat"])


def _service(db: Session) -> ChatbotService:
    return ChatbotService(db)


@router.post("/sessions", response_model=ChatSessionSummary, status_code=status.HTTP_201_CREATED)
def create_chat_session(
    payload: ChatSessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = _service(db)
    session = service.create_session(user, title=payload.title)
    return session


@router.get("/sessions", response_model=list[ChatSessionSummary])
def list_chat_sessions(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    service = _service(db)
    return service.list_sessions(user)


@router.get("/sessions/{session_id}", response_model=ChatSessionDetail)
def get_chat_session(session_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    service = _service(db)
    session = service.get_session(user, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesi chat tidak ditemukan.")
    return ChatSessionDetail(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        messages=[ChatMessageRead.model_validate(m) for m in session.messages],
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat_session(session_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    service = _service(db)
    if not service.delete_session(user, session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesi chat tidak ditemukan.")
    return None


@router.post("/sessions/{session_id}/messages", response_model=ChatTurnResponse)
def send_chat_message(
    session_id: uuid.UUID,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = _service(db)
    try:
        session, user_msg, assistant_msg, sources, model = service.send_message(user, session_id, payload.content)
    except ValueError as exc:
        status_code = status.HTTP_429_TOO_MANY_REQUESTS if "laju" in str(exc) else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Gagal memproses chat.")

    try:
        AuditService.log(
            db,
            entity_type="chat_session",
            entity_id=session.id,
            action="CHAT_MESSAGE",
            user_id=user.id,
            field_name="message_count",
            new_value=f"user={len(payload.content)} assistant={len(assistant_msg.content)}",
        )
        db.commit()
    except Exception:
        db.rollback()

    role = str(user.role.value if hasattr(user.role, "value") else user.role)
    return ChatTurnResponse(
        session_id=session.id,
        message=ChatMessageRead.model_validate(user_msg),
        answer=ChatMessageRead.model_validate(assistant_msg),
        sources=sources,
        model=model,
        role_scope=role,
    )