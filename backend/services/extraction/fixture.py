"""Fallback extraction mode for demos when Bedrock is unavailable (EXT-05).

Stored results are read from `{fixtures_dir}/{file sha256}.json`, or from
`{fixtures_dir}/{original filename}.json` when no hash-based fixture exists.
"""

import hashlib
import json
from pathlib import Path

from pydantic import ValidationError

from services.extraction import ExtractionError
from services.extraction.schema import ExtractedInvoice


class FixtureExtractor:
    def __init__(self, fixtures_dir: str):
        self.fixtures_dir = Path(fixtures_dir)

    def extract(self, data: bytes, mime_type: str, *, file_key: str, original_filename: str) -> ExtractedInvoice:
        candidates = [
            self.fixtures_dir / f"{hashlib.sha256(data).hexdigest()}.json",
            self.fixtures_dir / f"{Path(original_filename).name}.json",
        ]
        for path in candidates:
            if path.is_file():
                try:
                    return ExtractedInvoice.model_validate(json.loads(path.read_text(encoding="utf-8")))
                except (json.JSONDecodeError, ValidationError) as exc:
                    raise ExtractionError(f"Fixture {path.name} tidak valid: {exc}") from exc
        raise ExtractionError(f"Fixture ekstraksi untuk {original_filename} tidak ditemukan.")
