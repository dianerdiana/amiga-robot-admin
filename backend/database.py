import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

# Muat file konfigurasi .env
load_dotenv()

# Ambil konfigurasi dari environment variable
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "amiga_robot_admin")

DEFAULT_DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

# SQLAlchemy 1.4+ / 2.0+ mewajibkan skema 'postgresql://' alih-alih 'postgres://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

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
