import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "amiga-robot-admin-secret-key-change-in-production-2026")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # Kredensial AWS sengaja tidak dibaca di sini: boto3 mengambil AWS_ACCESS_KEY_ID,
    # AWS_SECRET_ACCESS_KEY, dan AWS_SESSION_TOKEN langsung dari environment / IAM role.
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-southeast-1")

    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "")
    S3_PRESIGNED_URL_EXPIRE_SECONDS: int = int(os.getenv("S3_PRESIGNED_URL_EXPIRE_SECONDS", "300"))
    UPLOAD_MAX_BYTES: int = int(os.getenv("UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))

    EXTRACTION_MODE: str = os.getenv("EXTRACTION_MODE", "bedrock").lower()
    BEDROCK_MODEL_ID: str = os.getenv("BEDROCK_MODEL_ID", "apac.amazon.nova-lite-v1:0")
    BEDROCK_REGION: str = os.getenv("BEDROCK_REGION", os.getenv("AWS_REGION", "ap-southeast-1"))
    BEDROCK_READ_TIMEOUT_SECONDS: int = int(os.getenv("BEDROCK_READ_TIMEOUT_SECONDS", "30"))
    BEDROCK_MAX_ATTEMPTS: int = int(os.getenv("BEDROCK_MAX_ATTEMPTS", "2"))

    # Postgres-queue based extraction worker (EXT-01).
    EXTRACTION_RUN_IN_API: bool = os.getenv("EXTRACTION_RUN_IN_API", "true").lower() in ("1", "true", "yes")
    EXTRACTION_WORKER_THREADS: int = int(os.getenv("EXTRACTION_WORKER_THREADS", "2"))
    EXTRACTION_POLL_SECONDS: float = float(os.getenv("EXTRACTION_POLL_SECONDS", "2"))
    # PROCESSING invoices older than this are considered stuck and get reclaimed.
    EXTRACTION_STALE_SECONDS: int = int(os.getenv("EXTRACTION_STALE_SECONDS", "300"))
    # Fallback mode EXTRACTION_MODE=fixture reads stored results from this folder (EXT-05).
    EXTRACTION_FIXTURES_DIR: str = os.getenv(
        "EXTRACTION_FIXTURES_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures", "extractions"),
    )

    # Allowed total difference before TOTAL_MISMATCH, in Rupiah (VAL-03).
    TOTAL_TOLERANCE: str = os.getenv("TOTAL_TOLERANCE", "0")
    ROBOT_ADMIN_EMAIL: str = os.getenv("ROBOT_ADMIN_EMAIL", "robot@amiga.system")

    # ===== Chatbot (AI assistant, read-only) =====
    BEDROCK_CHAT_MODEL_ID: str = os.getenv("BEDROCK_CHAT_MODEL_ID", os.getenv("BEDROCK_MODEL_ID", "apac.amazon.nova-lite-v1:0"))
    BEDROCK_KNOWLEDGE_BASE_ID: str = os.getenv("BEDROCK_KNOWLEDGE_BASE_ID", "YHZIWDET4V").strip()
    BEDROCK_KNOWLEDGE_BASE_REGION: str = os.getenv("BEDROCK_KNOWLEDGE_BASE_REGION", os.getenv("BEDROCK_REGION", os.getenv("AWS_REGION", "ap-southeast-1")))
    BEDROCK_GUARDRAIL_ID: str = os.getenv("BEDROCK_GUARDRAIL_ID", "").strip()
    BEDROCK_GUARDRAIL_VERSION: str = os.getenv("BEDROCK_GUARDRAIL_VERSION", "").strip()
    CHAT_RETRIEVE_TOP_K: int = int(os.getenv("CHAT_RETRIEVE_TOP_K", "5"))
    CHAT_MAX_HISTORY_MESSAGES: int = int(os.getenv("CHAT_MAX_HISTORY_MESSAGES", "12"))
    CHAT_MAX_MESSAGE_CHARS: int = int(os.getenv("CHAT_MAX_MESSAGE_CHARS", "2000"))
    CHAT_MAX_OUTPUT_TOKENS: int = int(os.getenv("CHAT_MAX_OUTPUT_TOKENS", "1000"))
    CHAT_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("CHAT_RATE_LIMIT_PER_MINUTE", "10"))

    # Temporary operational mode requested for the reviewer workflow: an intake upload
    # creates reviewer assignments for every active Finance Reviewer automatically.
    REVIEWER_AUTO_ASSIGN_ON_UPLOAD: bool = os.getenv(
        "REVIEWER_AUTO_ASSIGN_ON_UPLOAD", "true"
    ).lower() in ("1", "true", "yes", "on")


settings = Settings()
