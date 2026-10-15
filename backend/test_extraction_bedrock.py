import unittest
from decimal import Decimal

from botocore.exceptions import ClientError, ReadTimeoutError

from services.extraction import ExtractionError
from services.extraction.bedrock import INLINE_DOCUMENT_LIMIT_BYTES, BedrockExtractor
from services.extraction.schema import EXTRACTION_TOOL_NAME, ExtractedInvoice, parse_amount


def tool_use_response(payload: dict) -> dict:
    return {
        "output": {
            "message": {
                "role": "assistant",
                "content": [{"toolUse": {"toolUseId": "t1", "name": EXTRACTION_TOOL_NAME, "input": payload}}],
            }
        },
        "stopReason": "tool_use",
        "usage": {"inputTokens": 1200, "outputTokens": 300},
    }


class StubBedrock:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.requests: list[dict] = []

    def converse(self, **request):
        self.requests.append(request)
        if self.error:
            raise self.error
        return self.response


INVOICE_PAYLOAD = {
    "readable": True,
    "vendor_name": "  PT Sinar   Abadi Perkasa ",
    "invoice_number": "INV/2026/02/0991",
    "invoice_date": "2026-02-18",
    "bank_account": None,
    "tax_amount": "Rp123.750,00",
    "discount_amount": 0,
    "total_amount": 1248750,
    "items": [
        {"line_no": 1, "description": "Kertas HVS A4", "quantity": 10, "unit_price": 55000, "amount": 550000},
        {"line_no": 2, "description": "Tinta C-902", "quantity": 2, "unit_price": 225000, "amount": 450000},
        {"line_no": 3, "description": "Klip binder", "quantity": 5, "unit_price": "25.000", "amount": 125000.0},
    ],
}


class BedrockExtractorTestCase(unittest.TestCase):
    def extract(self, stub, data=b"%PDF-1.4", mime="application/pdf"):
        return BedrockExtractor(client=stub, model_id="test-model").extract(
            data, mime, file_key="clients/a/invoices/b.pdf", original_filename="b.pdf"
        )

    def test_tool_use_output_is_parsed_into_structured_invoice(self):
        stub = StubBedrock(tool_use_response(INVOICE_PAYLOAD))
        result = self.extract(stub)

        self.assertIsInstance(result, ExtractedInvoice)
        self.assertEqual(result.vendor_name, "PT Sinar Abadi Perkasa")
        self.assertEqual(result.tax_amount, Decimal("123750.00"))
        self.assertEqual(len(result.items), 3)
        self.assertEqual(result.items[2].unit_price, Decimal("25000"))
        self.assertIsNone(result.bank_account)  # EXT-03: not guessed
        self.assertEqual(result.model_dump(mode="json")["total_amount"], "1248750")

        request = stub.requests[0]
        self.assertEqual(request["modelId"], "test-model")
        self.assertEqual(request["toolConfig"]["toolChoice"], {"tool": {"name": EXTRACTION_TOOL_NAME}})
        self.assertEqual(request["inferenceConfig"]["temperature"], 0)
        document = request["messages"][0]["content"][0]["document"]
        self.assertEqual(document["format"], "pdf")
        self.assertEqual(document["source"], {"bytes": b"%PDF-1.4"})

    def test_images_use_image_block_and_large_files_use_s3(self):
        stub = StubBedrock(tool_use_response(INVOICE_PAYLOAD))
        self.extract(stub, data=b"\x89PNG", mime="image/png")
        self.assertEqual(stub.requests[0]["messages"][0]["content"][0]["image"]["format"], "png")

        self.extract(stub, data=b"x" * (INLINE_DOCUMENT_LIMIT_BYTES + 1))
        source = stub.requests[1]["messages"][0]["content"][0]["document"]["source"]
        self.assertTrue(source["s3Location"]["uri"].endswith("/clients/a/invoices/b.pdf"))

    def test_text_fallback_when_model_skips_tool(self):
        response = {
            "output": {"message": {"content": [{"text": 'Berikut hasilnya:\n{"readable": false, "items": []}'}]}},
            "stopReason": "end_turn",
        }
        result = self.extract(StubBedrock(response))
        self.assertFalse(result.readable)
        self.assertEqual(result.items, [])

    def test_errors_become_extraction_errors(self):
        throttled = ClientError({"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}}, "Converse")
        with self.assertRaisesRegex(ExtractionError, "ThrottlingException"):
            self.extract(StubBedrock(error=throttled))
        with self.assertRaisesRegex(ExtractionError, "tidak dapat dihubungi"):
            self.extract(StubBedrock(error=ReadTimeoutError(endpoint_url="https://bedrock")))
        no_json = {"output": {"message": {"content": [{"text": "Maaf, saya tidak bisa."}]}}}
        with self.assertRaisesRegex(ExtractionError, "terstruktur"):
            self.extract(StubBedrock(no_json))
        with self.assertRaises(ExtractionError):
            self.extract(StubBedrock(tool_use_response({"readable": "mungkin", "items": []})))

    def test_missing_line_numbers_are_filled_in_order(self):
        payload = {**INVOICE_PAYLOAD, "items": [{"description": "A"}, {"description": "B"}]}
        result = self.extract(StubBedrock(tool_use_response(payload)))
        self.assertEqual([item.line_no for item in result.items], [1, 2])

    def test_amount_parsing_formats(self):
        cases = {
            "Rp1.250.000,00": "1250000.00",
            "1,250,000.00": "1250000.00",
            "125.000": "125000",
            "12,5": "12.5",
            "1.5": "1.5",
            1500: "1500",
        }
        for raw, expected in cases.items():
            self.assertEqual(parse_amount(raw), Decimal(expected), raw)
        self.assertIsNone(parse_amount("-"))
        self.assertIsNone(parse_amount(None))


if __name__ == "__main__":
    unittest.main()
