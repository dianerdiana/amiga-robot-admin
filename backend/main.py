from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from database import get_db
from routes import auth_router

app = FastAPI(
    title="AMIGA Robot Admin Backend",
    version="1.0.0",
    description="API Backend untuk platform AMIGA Robot Admin (Invoice ke Voucher)",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrasi Router
app.include_router(auth_router, prefix="/api/v1")
app.include_router(auth_router)  # Memungkinkan akses langsung /auth/login dsb.


@app.get("/")
def read_root():
    return {
        "message": "Halo, FastAPI backend AMIGA Robot Admin berhasil dijalankan!",
        "docs_url": "/docs",
    }


@app.get("/health/db")
def check_db_health(db: Session = Depends(get_db)):
    """
    Endpoint untuk menguji koneksi ke database PostgreSQL.
    """
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
