"""Smoke test konfigurasi AWS (STS, S3, Bedrock).

Jalankan dari folder backend:
    python -m scripts.check_aws
    python -m scripts.check_aws --pdf path/to/sample.pdf
"""

import argparse
import sys
import uuid
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

import boto3

from core.aws import get_bedrock_runtime_client, get_s3_client, s3_key
from core.config import settings

HINTS = {
    "InvalidClientTokenId": "AWS_ACCESS_KEY_ID salah atau sudah dinonaktifkan.",
    "SignatureDoesNotMatch": "AWS_SECRET_ACCESS_KEY tidak cocok dengan access key.",
    "ExpiredToken": "Kredensial sementara kedaluwarsa; hapus AWS_SESSION_TOKEN atau perbarui.",
    "AccessDenied": "IAM user belum punya izin s3:PutObject/GetObject/DeleteObject pada bucket.",
    "NoSuchBucket": "S3_BUCKET_NAME salah (isi nama bucket saja, tanpa s3://).",
    "AccessDeniedException": "Aktifkan Model access Nova Lite di console Bedrock, atau tambahkan izin bedrock:InvokeModel.",
    "ValidationException": "BEDROCK_MODEL_ID atau BEDROCK_REGION tidak cocok, atau format input ditolak model.",
    "ResourceNotFoundException": "Model/inference profile tidak ditemukan di region ini.",
    "ThrottlingException": "Kuota Bedrock terlampaui; coba lagi sebentar.",
}


def _fail(name: str, exc: Exception) -> bool:
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        message = exc.response.get("Error", {}).get("Message", "")
        hint = HINTS.get(code, "")
        print(f"[FAIL] {name}: {code} - {message}")
        if hint:
            print(f"       Petunjuk: {hint}")
    elif isinstance(exc, NoCredentialsError):
        print(f"[FAIL] {name}: kredensial tidak ditemukan. Isi AWS_ACCESS_KEY_ID dan AWS_SECRET_ACCESS_KEY di backend/.env.")
    else:
        print(f"[FAIL] {name}: {type(exc).__name__}: {exc}")
    return False


def check_identity() -> bool:
    try:
        identity = boto3.client("sts", region_name=settings.AWS_REGION).get_caller_identity()
    except (ClientError, BotoCoreError) as exc:
        return _fail("STS identity", exc)
    print(f"[OK]   STS identity: akun {identity['Account']}, {identity['Arn']}")
    return True


def check_s3() -> bool:
    if not settings.S3_BUCKET_NAME:
        print("[FAIL] S3: S3_BUCKET_NAME kosong.")
        return False
    key = s3_key("_healthcheck", f"{uuid.uuid4()}.txt")
    body = b"amiga-robot-admin healthcheck"
    s3 = get_s3_client()
    try:
        s3.put_object(Bucket=settings.S3_BUCKET_NAME, Key=key, Body=body, ContentType="text/plain")
        try:
            got = s3.get_object(Bucket=settings.S3_BUCKET_NAME, Key=key)["Body"].read()
            if got != body:
                print("[FAIL] S3: isi objek yang dibaca tidak sama dengan yang ditulis.")
                return False
        finally:
            s3.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except (ClientError, BotoCoreError) as exc:
        return _fail("S3 put/get/delete", exc)
    print(f"[OK]   S3 put/get/delete: s3://{settings.S3_BUCKET_NAME}/{key}")
    return True


def _converse(content: list) -> str:
    response = get_bedrock_runtime_client().converse(
        modelId=settings.BEDROCK_MODEL_ID,
        messages=[{"role": "user", "content": content}],
        inferenceConfig={"maxTokens": 200, "temperature": 0},
    )
    return response["output"]["message"]["content"][0]["text"].strip()


def check_bedrock_text() -> bool:
    try:
        reply = _converse([{"text": "Reply with exactly: OK"}])
    except (ClientError, BotoCoreError) as exc:
        return _fail("Bedrock converse", exc)
    print(f"[OK]   Bedrock converse ({settings.BEDROCK_MODEL_ID}): {reply[:60]!r}")
    return True


def check_bedrock_pdf(path: Path) -> bool:
    if not path.is_file():
        print(f"[FAIL] Bedrock PDF: file {path} tidak ditemukan.")
        return False
    data = path.read_bytes()
    if len(data) > 4_500_000:
        print("[WARN] Bedrock PDF: file > 4,5 MB, kemungkinan melebihi batas dokumen inline Converse.")
    try:
        reply = _converse(
            [
                {"document": {"format": "pdf", "name": "sample", "source": {"bytes": data}}},
                {"text": "Sebutkan nama vendor dan nomor invoice dari dokumen ini dalam satu baris."},
            ]
        )
    except (ClientError, BotoCoreError) as exc:
        return _fail("Bedrock PDF document", exc)
    print(f"[OK]   Bedrock PDF document: {reply[:120]!r}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test konfigurasi AWS AMIGA Robot Admin.")
    parser.add_argument("--pdf", type=Path, help="PDF contoh untuk uji input dokumen ke Bedrock.")
    args = parser.parse_args()

    print(f"Region: {settings.AWS_REGION} | Bucket: {settings.S3_BUCKET_NAME}")
    results = [check_identity(), check_s3(), check_bedrock_text()]
    if args.pdf:
        results.append(check_bedrock_pdf(args.pdf))

    passed = sum(results)
    print(f"\n{passed}/{len(results)} pemeriksaan berhasil.")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
