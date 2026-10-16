"""Strict application settings.

Every setting must be provided explicitly (environment variable or backend/.env); nothing
falls back to a built-in default. Missing, malformed, or placeholder values abort startup
with one message that lists every problem, so a misconfigured deployment never runs with
silently substituted values.
"""

import os
from decimal import Decimal
from typing import Annotated, Literal
from urllib.parse import quote

from dotenv import load_dotenv
from pydantic import (
    EmailStr,
    Field,
    PositiveFloat,
    PositiveInt,
    SecretStr,
    StringConstraints,
    ValidationError,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load backend/.env into os.environ (real environment variables win). Exporting it, rather
# than only feeding it to pydantic, also lets boto3 pick up local AWS_* credentials; on EC2
# those stay unset and boto3 uses the instance IAM role.
load_dotenv(os.path.join(BASE_DIR, ".env"))

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
# Key must be present, but an empty value is a deliberate "disabled".
OptionalStr = Annotated[str, StringConstraints(strip_whitespace=True)]

# Values copied from .env.example that were never replaced.
PLACEHOLDER_MARKERS = ("change_me", "change-me", "change-in-production")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True, extra="ignore")

    # ===== Database =====
    DB_USER: NonEmptyStr
    DB_PASSWORD: SecretStr
    DB_HOST: NonEmptyStr
    DB_PORT: Annotated[int, Field(ge=1, le=65535)]
    DB_NAME: NonEmptyStr
    # The only optional setting: an explicit full-URL override (used by test_invoices.py
    # to point a subprocess at the test database). DB_* above are still required.
    DATABASE_URL: SecretStr | None = None

    # ===== HTTP =====
    # Comma-separated origins allowed to call the API cross-origin; empty = same-origin only.
    CORS_ALLOW_ORIGINS: OptionalStr
    API_DOCS_ENABLED: bool

    # ===== JWT =====
    JWT_SECRET_KEY: SecretStr
    JWT_ALGORITHM: Literal["HS256", "HS384", "HS512"]
    ACCESS_TOKEN_EXPIRE_MINUTES: PositiveInt
    REFRESH_TOKEN_EXPIRE_DAYS: PositiveInt

    # ===== AWS / S3 =====
    # Credentials are intentionally not read here: boto3 takes AWS_ACCESS_KEY_ID,
    # AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN from the environment / IAM role.
    AWS_REGION: NonEmptyStr
    S3_BUCKET_NAME: NonEmptyStr
    # Region of S3_BUCKET_NAME; independent of Bedrock (production runs Bedrock in
    # us-east-1 while the bucket stays in ap-southeast-1).
    S3_REGION: NonEmptyStr
    S3_PRESIGNED_URL_EXPIRE_SECONDS: PositiveInt
    UPLOAD_MAX_BYTES: PositiveInt

    # ===== Bedrock extraction =====
    EXTRACTION_MODE: Literal["bedrock", "fixture"]
    BEDROCK_MODEL_ID: NonEmptyStr
    BEDROCK_REGION: NonEmptyStr
    BEDROCK_READ_TIMEOUT_SECONDS: PositiveInt
    BEDROCK_MAX_ATTEMPTS: PositiveInt

    # ===== Postgres-queue based extraction worker (EXT-01) =====
    EXTRACTION_RUN_IN_API: bool
    EXTRACTION_WORKER_THREADS: PositiveInt
    EXTRACTION_POLL_SECONDS: PositiveFloat
    # PROCESSING invoices older than this are considered stuck and get reclaimed.
    EXTRACTION_STALE_SECONDS: PositiveInt
    # Stored results read by EXTRACTION_MODE=fixture (EXT-05); relative to the backend folder.
    EXTRACTION_FIXTURES_DIR: NonEmptyStr

    # ===== Validation =====
    # Allowed total difference before TOTAL_MISMATCH, in Rupiah (VAL-03).
    TOTAL_TOLERANCE: Annotated[Decimal, Field(ge=0)]
    ROBOT_ADMIN_EMAIL: EmailStr

    # ===== Chatbot (AI assistant, read-only) =====
    BEDROCK_CHAT_MODEL_ID: NonEmptyStr
    BEDROCK_KNOWLEDGE_BASE_ID: NonEmptyStr
    BEDROCK_KNOWLEDGE_BASE_REGION: NonEmptyStr
    BEDROCK_GUARDRAIL_ID: OptionalStr
    BEDROCK_GUARDRAIL_VERSION: OptionalStr
    CHAT_RETRIEVE_TOP_K: PositiveInt
    CHAT_MAX_HISTORY_MESSAGES: PositiveInt
    CHAT_MAX_MESSAGE_CHARS: PositiveInt
    CHAT_MAX_OUTPUT_TOKENS: PositiveInt
    CHAT_RATE_LIMIT_PER_MINUTE: PositiveInt

    # Temporary operational mode requested for the reviewer workflow: an intake upload
    # creates reviewer assignments for every active Finance Reviewer automatically.
    REVIEWER_AUTO_ASSIGN_ON_UPLOAD: bool

    @field_validator("*", mode="after")
    @classmethod
    def _reject_placeholders(cls, value):
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if isinstance(raw, str) and any(marker in raw.lower() for marker in PLACEHOLDER_MARKERS):
            raise ValueError("still contains a placeholder value from .env.example")
        return value

    @field_validator("JWT_SECRET_KEY", "DB_PASSWORD", mode="after")
    @classmethod
    def _secret_not_blank(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("must not be empty")
        return value

    @field_validator("JWT_SECRET_KEY", mode="after")
    @classmethod
    def _jwt_secret_strength(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("must be at least 32 characters (generate with: openssl rand -hex 32)")
        return value

    @field_validator("EXTRACTION_FIXTURES_DIR", mode="after")
    @classmethod
    def _resolve_fixtures_dir(cls, value: str) -> str:
        return value if os.path.isabs(value) else os.path.join(BASE_DIR, value)

    @model_validator(mode="after")
    def _cross_field_checks(self) -> "Settings":
        if bool(self.BEDROCK_GUARDRAIL_ID) != bool(self.BEDROCK_GUARDRAIL_VERSION):
            raise ValueError("BEDROCK_GUARDRAIL_ID and BEDROCK_GUARDRAIL_VERSION must be set together or both left empty")
        if self.EXTRACTION_MODE == "fixture" and not os.path.isdir(self.EXTRACTION_FIXTURES_DIR):
            raise ValueError(f"EXTRACTION_FIXTURES_DIR does not exist: {self.EXTRACTION_FIXTURES_DIR}")
        return self

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL is not None:
            url = self.DATABASE_URL.get_secret_value()
            # SQLAlchemy 2.0 requires 'postgresql://' instead of 'postgres://'.
            return url.replace("postgres://", "postgresql://", 1) if url.startswith("postgres://") else url
        return (
            f"postgresql://{quote(self.DB_USER, safe='')}:{quote(self.DB_PASSWORD.get_secret_value(), safe='')}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]


def _load_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        lines = []
        for error in exc.errors():
            key = ".".join(str(part) for part in error["loc"]) or "settings"
            reason = "is not set" if error["type"] == "missing" else error["msg"].removeprefix("Value error, ")
            lines.append(f"  - {key}: {reason}")
        raise SystemExit(
            "Invalid configuration (set these in the environment or backend/.env; see backend/.env.example):\n"
            + "\n".join(lines)
        ) from None


settings = _load_settings()
