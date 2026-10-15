import re
from typing import Annotated

from pydantic import AfterValidator


_INTERNAL_EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$"
)


def normalize_internal_email(value: str) -> str:
    """Validasi format email tanpa menolak domain private seperti `.local`."""
    normalized = value.strip().lower()
    if len(normalized) > 255 or not _INTERNAL_EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("Format email tidak valid.")
    return normalized


InternalEmail = Annotated[str, AfterValidator(normalize_internal_email)]

