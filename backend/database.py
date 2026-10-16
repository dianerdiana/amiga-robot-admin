from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from core.config import settings

# Semua nilai koneksi wajib diset secara eksplisit (lihat core/config.py); tidak ada default.
DATABASE_URL = settings.database_url

# Buat SQLAlchemy Engine
# pool_pre_ping=True memeriksa koneksi sebelum digunakan agar koneksi stale otomatis di-refresh
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Factory session untuk koneksi database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class untuk deklarasi model ORM mendatang (tanpa membuat tabel apa pun saat ini)
Base = declarative_base()


def get_db():
    """
    Dependency generator FastAPI untuk menyediakan database session per request
    dan menutupnya secara otomatis setelah request selesai.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_connection() -> bool:
    """
    Fungsi pengujian koneksi ke database PostgreSQL.
    """
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        return result.scalar() == 1
