import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from database import get_db
from routes import auth_router, chat_router, clients_router, extraction_router, invoices_router, me_router, users_router, vouchers_router
from workers.extraction_worker import extraction_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.EXTRACTION_RUN_IN_API:
        extraction_worker.start()
    if settings.REVIEWER_AUTO_ASSIGN_ON_UPLOAD:
        try:
            from database import SessionLocal
            from services.invoice_service import InvoiceService

            with SessionLocal() as db:
                InvoiceService.ensure_reviewer_assignments_for_all_clients(db)
                db.commit()
        except Exception:  # pragma: no cover - startup helper must not block app boot
            logger.exception("Failed to backfill temporary reviewer assignments")
    try:
        yield
    finally:
        if settings.EXTRACTION_RUN_IN_API:
            extraction_worker.stop()


app = FastAPI(
    title="AMIGA Robot Admin Backend",
    version="1.0.0",
    description="API Backend untuk platform AMIGA Robot Admin (Invoice ke Voucher)",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# Registrasi Router
app.include_router(auth_router, prefix="/api/v1")
app.include_router(auth_router)
app.include_router(chat_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(clients_router, prefix="/api/v1")
app.include_router(me_router, prefix="/api/v1")
app.include_router(invoices_router, prefix="/api/v1")
app.include_router(extraction_router, prefix="/api/v1")
app.include_router(vouchers_router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {
        "message": "Halo, FastAPI backend AMIGA Robot Admin berhasil dijalankan!",
        "docs_url": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "AMIGA Robot Admin Backend",
    }


@app.get("/health/db")
def check_db_health(db: Session = Depends(get_db)):
    try:
        result = db.execute(text("SELECT 1")).scalar()
        return {
            "status": "connected",
            "message": "Koneksi ke database PostgreSQL berhasil!",
            "result": result,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal terhubung ke database PostgreSQL: {str(e)}",
        )
