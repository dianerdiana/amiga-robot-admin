from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

app = FastAPI(title="AMIGA Robot Admin Backend")


@app.get("/")
def read_root():
    return {"message": "Halo, FastAPI berhasil dijalankan!"}


@app.get("/health/db")
def check_db_health(db: Session = Depends(get_db)):
    """
    Endpoint untuk menguji koneksi ke database PostgreSQL
    tanpa membuat table apapun.
    """
    try:
        # Menjalankan query sederhana 'SELECT 1' untuk memverifikasi koneksi aktif
        result = db.execute(text("SELECT 1")).scalar()
        return {
            "status": "connected",
            "message": "Koneksi ke database PostgreSQL berhasil!",
            "result": result
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal terhubung ke database PostgreSQL: {str(e)}"
        )
