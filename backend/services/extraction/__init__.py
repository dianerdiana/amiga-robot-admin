from typing import Protocol

from core.config import settings
from services.extraction.schema import ExtractedInvoice, ExtractedItem


class ExtractionError(Exception):
    """Extraction failed (Bedrock error, timeout, or invalid output)."""


class Extractor(Protocol):
    def extract(self, data: bytes, mime_type: str, *, file_key: str, original_filename: str) -> ExtractedInvoice: ...


def get_extractor() -> Extractor:
    """Pick the extractor based on EXTRACTION_MODE (EXT-05, EXT-06)."""
    if settings.EXTRACTION_MODE == "fixture":
        from services.extraction.fixture import FixtureExtractor

        return FixtureExtractor(settings.EXTRACTION_FIXTURES_DIR)
    from services.extraction.bedrock import BedrockExtractor

    return BedrockExtractor()


__all__ = ["ExtractedInvoice", "ExtractedItem", "ExtractionError", "Extractor", "get_extractor"]
