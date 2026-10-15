"""Invoice extraction with the Amazon Bedrock Converse API (EXT-01, EXT-06).

Structured output comes from tool use: the model is forced to call the
`record_invoice` tool, so the extracted JSON is read from the toolUse block rather
than from free text. If the model still answers in text, the first JSON object in
that text is validated against the same schema.
"""

import json
import logging
import re

from botocore.exceptions import BotoCoreError, ClientError
from pydantic import ValidationError

from core.aws import get_bedrock_runtime_client
from core.config import settings
from services.extraction import ExtractionError
from services.extraction.schema import (
    EXTRACTION_TOOL_NAME,
    EXTRACTION_TOOL_SCHEMA,
    ExtractedInvoice,
)

logger = logging.getLogger(__name__)

# Converse inline document limit; larger files are read directly from S3.
INLINE_DOCUMENT_LIMIT_BYTES = 4_500_000

IMAGE_FORMATS = {"image/png": "png", "image/jpeg": "jpeg"}

SYSTEM_PROMPT = """Anda adalah asisten ekstraksi data invoice vendor berbahasa Indonesia.
Baca dokumen invoice yang diberikan lalu panggil tool record_invoice tepat satu kali.

Aturan:
- Salin nilai persis seperti tertulis di dokumen. Jangan menebak atau menghitung nilai yang tidak tertulis; isi null bila tidak ditemukan.
- Baca SEMUA baris barang/jasa dari atas ke bawah, termasuk baris di halaman berikutnya. Jangan menggabungkan atau melewatkan baris.
- Nominal ditulis sebagai angka tanpa simbol mata uang dan tanpa pemisah ribuan (contoh: Rp1.250.000,00 menjadi 1250000.00).
- Tanggal ditulis dalam format YYYY-MM-DD.
- bank_account berisi nama bank dan nomor rekening tujuan pembayaran vendor, bukan rekening pembeli.
- Baca ringkasan di bawah tabel baris satu per satu:
  - tax_amount = nilai pada label "PPN", "Pajak", atau "VAT".
  - discount_amount = nilai pada label "Diskon", "Potongan", atau "Discount", salin persis nominal yang tertulis (contoh: "Diskon: Rp50.000,00" menjadi 50000.00). Isi 0 hanya bila tertulis Rp0 atau "tanpa diskon"; isi null bila label diskon tidak ada sama sekali.
  - total_amount = nilai pada label "Total", "Grand Total", atau "Total Tagihan", bukan Subtotal.
- Isi readable=false bila dokumen buram, terpotong, terlalu gelap, atau bukan invoice."""

USER_PROMPT = "Ekstrak data invoice dari dokumen ini dengan memanggil tool record_invoice."


class BedrockExtractor:
    def __init__(self, client=None, model_id: str | None = None):
        self._client = client
        self.model_id = model_id or settings.BEDROCK_MODEL_ID

    @property
    def client(self):
        if self._client is None:
            self._client = get_bedrock_runtime_client()
        return self._client

    def extract(self, data: bytes, mime_type: str, *, file_key: str, original_filename: str) -> ExtractedInvoice:
        request = {
            "modelId": self.model_id,
            "system": [{"text": SYSTEM_PROMPT}],
            "messages": [
                {
                    "role": "user",
                    "content": [self._file_block(data, mime_type, file_key), {"text": USER_PROMPT}],
                }
            ],
            "inferenceConfig": {"maxTokens": 4096, "temperature": 0},
            "toolConfig": {
                "tools": [
                    {
                        "toolSpec": {
                            "name": EXTRACTION_TOOL_NAME,
                            "description": "Simpan data terstruktur hasil ekstraksi invoice.",
                            "inputSchema": {"json": EXTRACTION_TOOL_SCHEMA},
                        }
                    }
                ],
                "toolChoice": {"tool": {"name": EXTRACTION_TOOL_NAME}},
            },
        }
        try:
            response = self.client.converse(**request)
        except ClientError as exc:
            error = exc.response.get("Error", {})
            raise ExtractionError(f"Bedrock {error.get('Code', 'ClientError')}: {error.get('Message', '')}") from exc
        except BotoCoreError as exc:
            raise ExtractionError(f"Bedrock tidak dapat dihubungi: {exc}") from exc

        usage = response.get("usage", {})
        logger.info(
            "Bedrock extraction selesai: model=%s stop=%s input_tokens=%s output_tokens=%s",
            self.model_id,
            response.get("stopReason"),
            usage.get("inputTokens"),
            usage.get("outputTokens"),
        )
        return parse_converse_output(response)

    def _file_block(self, data: bytes, mime_type: str, file_key: str) -> dict:
        if len(data) > INLINE_DOCUMENT_LIMIT_BYTES:
            source = {"s3Location": {"uri": f"s3://{settings.S3_BUCKET_NAME}/{file_key}"}}
        else:
            source = {"bytes": data}
        if mime_type == "application/pdf":
            return {"document": {"format": "pdf", "name": "invoice", "source": source}}
        if mime_type in IMAGE_FORMATS:
            return {"image": {"format": IMAGE_FORMATS[mime_type], "source": source}}
        raise ExtractionError(f"Tipe file {mime_type} tidak didukung untuk ekstraksi.")


def parse_converse_output(response: dict) -> ExtractedInvoice:
    """Read the JSON from the toolUse block, falling back to the first JSON object in the text."""
    content = response.get("output", {}).get("message", {}).get("content", [])
    payload = None
    for block in content:
        tool_use = block.get("toolUse")
        if tool_use and tool_use.get("name") == EXTRACTION_TOOL_NAME:
            payload = tool_use.get("input")
            break
    if payload is None:
        text = "".join(block.get("text", "") for block in content)
        payload = _first_json_object(text)
    if not isinstance(payload, dict):
        raise ExtractionError("Model tidak mengembalikan data terstruktur.")
    try:
        return ExtractedInvoice.model_validate(payload)
    except ValidationError as exc:
        raise ExtractionError(f"Keluaran model tidak sesuai skema: {exc.error_count()} kesalahan.") from exc


def _first_json_object(text: str) -> dict | None:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
