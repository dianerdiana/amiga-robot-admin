from functools import lru_cache

import boto3
from botocore.config import Config

from core.config import settings


@lru_cache
def get_s3_client():
    """Client S3 bersama; kredensial diambil dari default chain boto3."""
    return boto3.client("s3", region_name=settings.S3_REGION)


@lru_cache
def get_bedrock_runtime_client():
    """Client Bedrock Runtime dengan timeout dan retry dari konfigurasi (EXT-06)."""
    return boto3.client(
        "bedrock-runtime",
        region_name=settings.BEDROCK_REGION,
        config=Config(
            read_timeout=settings.BEDROCK_READ_TIMEOUT_SECONDS,
            retries={"max_attempts": settings.BEDROCK_MAX_ATTEMPTS, "mode": "standard"},
        ),
    )


@lru_cache
def get_bedrock_agent_runtime_client():
    """Client Bedrock Agent Runtime untuk Bedrock Knowledge Base retrieval."""
    return boto3.client(
        "bedrock-agent-runtime",
        region_name=settings.BEDROCK_KNOWLEDGE_BASE_REGION,
        config=Config(retries={"max_attempts": 2, "mode": "standard"}),
    )


def s3_key(*parts: str) -> str:
    """Gabungkan bagian path menjadi object key S3, mis. clients/{id}/invoices/{id}.pdf."""
    return "/".join(p.strip("/") for p in parts if p.strip("/"))
