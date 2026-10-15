# Extraction fixtures (fallback mode, EXT-05)

Used when `EXTRACTION_MODE=fixture`. The worker looks up a stored extraction result
by file content first, then by the original filename:

1. `{sha256 of the file content}.json`
2. `{original filename}.json`, e.g. `demo-normal.pdf.json`

Upload any valid PDF/JPG/PNG file with one of these names to demo the PRD scenarios:

| File name                 | Validation result                       |
| ------------------------- | --------------------------------------- |
| `demo-normal.pdf`         | READY_FOR_REVIEW (S1)                   |
| `demo-multiline.pdf`      | READY_FOR_REVIEW, 5 line items (S2)     |
| `demo-missing-bank.pdf`   | EXCEPTION, MISSING_EVIDENCE (S3)        |
| `demo-duplicate-a.pdf`    | READY_FOR_REVIEW                        |
| `demo-duplicate-b.pdf`    | POSSIBLE_DUPLICATE after file A (S4)    |
| `demo-total-mismatch.pdf` | EXCEPTION, TOTAL_MISMATCH               |
| `demo-unreadable.jpg`     | EXCEPTION, UNREADABLE_DOCUMENT          |

The JSON format follows `services/extraction/schema.py` (`ExtractedInvoice`).
