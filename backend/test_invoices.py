"""Tests for invoice upload, the extraction worker, validation, and the queue.

Requires PostgreSQL (ARRAY/JSONB/SKIP LOCKED are not available in SQLite). The schema is
built with `alembic upgrade head`, so the migration and the Robot Admin seed are tested too:

    TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/amiga_robot_admin_test \
        python -m unittest test_invoices
"""

import io
import os
import re
import subprocess
import sys
import unittest
import uuid
from decimal import Decimal
from pathlib import Path
from unittest import mock

from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from core.config import settings
from core.security import create_access_token, hash_password
from database import get_db
from main import app
from models.audit_log import AuditLog
from models.client import Client
from models.invoice import Invoice, InvoiceStatus
from models.user import User, UserRole
from models.user_client import UserClient
from services.extraction import ExtractedInvoice, ExtractionError
from services.extraction.fixture import FixtureExtractor
from services.validation_service import normalize_bank_account, normalize_key, resolve_status
from workers.extraction_worker import claim_next, process

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
BACKEND_DIR = Path(__file__).resolve().parent
FIXTURES = FixtureExtractor(str(BACKEND_DIR / "fixtures" / "extractions"))

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
HEIC_BYTES = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 32


class FakeS3:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.fail_put = False

    def put_object(self, Bucket, Key, Body, ContentType):
        if self.fail_put:
            raise ClientError({"Error": {"Code": "InternalError", "Message": "boom"}}, "PutObject")
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        return {"Body": io.BytesIO(self.objects[Key])}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        return f"https://s3.test/{Params['Key']}?expires={ExpiresIn}"


class ScriptedExtractor:
    """Fake extractor: reads the demo fixtures, or raises scripted errors per filename."""

    def __init__(self):
        self.failures: dict[str, int] = {}
        self.calls: list[str] = []

    def extract(self, data, mime_type, *, file_key, original_filename):
        self.calls.append(original_filename)
        remaining = self.failures.get(original_filename, 0)
        if remaining:
            self.failures[original_filename] = remaining - 1
            raise ExtractionError("Bedrock ThrottlingException: Rate exceeded")
        return FIXTURES.extract(data, mime_type, file_key=file_key, original_filename=original_filename)


@unittest.skipUnless(TEST_DATABASE_URL, "TEST_DATABASE_URL belum diset (butuh PostgreSQL).")
class InvoiceApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
            check=True,
            capture_output=True,
        )
        cls.engine = create_engine(TEST_DATABASE_URL)
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)

        def override_get_db():
            db = cls.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        app.dependency_overrides.clear()
        cls.engine.dispose()

    def setUp(self):
        self.s3 = FakeS3()
        self.extractor = ScriptedExtractor()
        for target in ("services.invoice_service.get_s3_client", "workers.extraction_worker.get_s3_client"):
            patcher = mock.patch(target, return_value=self.s3)
            patcher.start()
            self.addCleanup(patcher.stop)

        with self.engine.begin() as conn:
            # TRUNCATE does not fire the per-row append-only trigger on audit_logs.
            conn.execute(text("TRUNCATE audit_logs, invoice_items, invoices, vouchers, user_clients CASCADE"))
            conn.execute(text("DELETE FROM clients"))
            conn.execute(text("DELETE FROM users WHERE email <> :robot"), {"robot": settings.ROBOT_ADMIN_EMAIL})

        with self.Session() as db:
            self.client_a = Client(code="CL-A", name="Klien A - Retail Mandiri")
            self.client_b = Client(code="CL-B", name="Klien B - Logistik Cepat")
            self.client_c = Client(code="CL-C", name="Klien C - Tanpa Reviewer")
            self.intake_a = self._user(db, "intake.a@amiga.local", UserRole.INTAKE)
            self.intake_b = self._user(db, "intake.b@amiga.local", UserRole.INTAKE)
            self.reviewer = self._user(db, "reviewer@amiga.local", UserRole.FINANCE_REVIEWER)
            db.add_all([self.client_a, self.client_b, self.client_c])
            db.flush()
            db.add_all(
                [
                    UserClient(user_id=self.intake_a.id, client_id=self.client_a.id),
                    UserClient(user_id=self.intake_a.id, client_id=self.client_c.id),
                    UserClient(user_id=self.intake_b.id, client_id=self.client_b.id),
                    UserClient(user_id=self.reviewer.id, client_id=self.client_a.id),
                ]
            )
            db.commit()
            for obj in (self.client_a, self.client_b, self.client_c, self.intake_a, self.intake_b, self.reviewer):
                db.refresh(obj)
                db.expunge(obj)

    # ------------------------------------------------------------------
    @staticmethod
    def _user(db, email, role):
        user = User(name=email.split("@")[0].title(), email=email, password_hash=hash_password("x"), role=role)
        db.add(user)
        return user

    @staticmethod
    def auth(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}

    def upload(self, filename="demo-normal.pdf", data=PDF_BYTES, user=None, client=None, **extra):
        user = user or self.intake_a
        client = client or self.client_a
        form = {"client_id": str(client.id), "channel": "WhatsApp", "request_date": "2026-02-24", **extra}
        return self.client.post(
            "/api/v1/invoices",
            headers=self.auth(user),
            data=form,
            files={"file": (filename, data, "application/octet-stream")},
        )

    def upload_ok(self, filename="demo-normal.pdf", **kwargs) -> dict:
        response = self.upload(filename, **kwargs)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def run_worker(self) -> int:
        processed = 0
        while True:
            with self.Session() as db:
                invoice_id = claim_next(db)
            if invoice_id is None:
                return processed
            process(invoice_id, extractor=self.extractor, session_factory=self.Session)
            processed += 1

    def detail(self, invoice_id, user=None) -> dict:
        response = self.client.get(f"/api/v1/invoices/{invoice_id}", headers=self.auth(user or self.intake_a))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def audit_actions(self, invoice_id) -> list[tuple[str, str]]:
        with self.Session() as db:
            rows = (
                db.query(AuditLog.action, User.email)
                .join(User, User.id == AuditLog.user_id)
                .filter(AuditLog.entity_id == uuid.UUID(invoice_id))
                .order_by(AuditLog.created_at, AuditLog.id)
                .all()
            )
        return [(row.action, row.email) for row in rows]

    # ------------------------------------------------------------------
    # Upload (UPL)
    # ------------------------------------------------------------------
    def test_upload_issues_request_id_stores_file_and_audits(self):
        body = self.upload_ok()
        self.assertRegex(body["request_id"], r"^REQ-\d{4}-\d{6}$")
        self.assertEqual(body["status"], "QUEUED")
        self.assertEqual(body["client"]["code"], "CL-A")
        self.assertTrue(body["has_reviewer"])
        self.assertEqual(body["file_size"], len(PDF_BYTES))
        self.assertEqual(body["mime_type"], "application/pdf")

        expected_key = f"clients/{self.client_a.id}/invoices/{body['id']}.pdf"
        self.assertIn(expected_key, self.s3.objects)
        self.assertEqual(self.audit_actions(body["id"]), [("UPLOADED", "intake.a@amiga.local")])

        second = self.upload_ok()
        self.assertNotEqual(second["request_id"], body["request_id"])

    def test_upload_detects_type_from_content(self):
        png = self.upload_ok("scan.pdf", data=PNG_BYTES)
        self.assertEqual(png["mime_type"], "image/png")
        self.assertTrue(any(key.endswith(".png") for key in self.s3.objects))

        heic = self.upload("foto.jpg", data=HEIC_BYTES)
        self.assertEqual(heic.status_code, 422)
        self.assertEqual(heic.json()["detail"], "Format HEIC belum didukung, ubah ke JPG atau PNG.")

        text_file = self.upload("invoice.pdf", data=b"bukan pdf")
        self.assertEqual(text_file.status_code, 422)

    def test_upload_rejects_files_over_limit(self):
        with mock.patch.object(settings, "UPLOAD_MAX_BYTES", len(PDF_BYTES) - 1):
            response = self.upload()
        self.assertEqual(response.status_code, 413)
        self.assertIn("10 MB", response.json()["detail"])

    def test_upload_requires_assignment_and_intake_role(self):
        forbidden = self.upload(client=self.client_b)
        self.assertEqual(forbidden.status_code, 403)
        self.assertIn("dicabut", forbidden.json()["detail"])

        reviewer = self.upload(user=self.reviewer)
        self.assertEqual(reviewer.status_code, 403)

        missing_meta = self.client.post(
            "/api/v1/invoices",
            headers=self.auth(self.intake_a),
            data={"client_id": str(self.client_a.id)},
            files={"file": ("a.pdf", PDF_BYTES, "application/pdf")},
        )
        self.assertEqual(missing_meta.status_code, 422)

    def test_s3_failure_creates_no_request(self):
        self.s3.fail_put = True
        response = self.upload()
        self.assertEqual(response.status_code, 502)
        self.assertIn("Request ID belum dibuat", response.json()["detail"])
        with self.Session() as db:
            self.assertEqual(db.query(Invoice).count(), 0)
            self.assertEqual(db.query(AuditLog).count(), 0)

    def test_previous_request_must_be_rejected_on_same_client(self):
        first = self.upload_ok()
        response = self.upload(previous_request_id=first["id"])
        self.assertEqual(response.status_code, 422)

        with self.Session() as db:
            db.execute(
                text(
                    "UPDATE invoices SET status='REJECTED', reviewed_by=:r, reject_note='Cap terpotong' WHERE id=:i"
                ),
                {"r": self.reviewer.id, "i": first["id"]},
            )
            db.commit()
        reupload = self.upload_ok(previous_request_id=first["id"])
        detail = self.detail(reupload["id"])
        self.assertEqual(detail["previous_request"]["request_id"], first["request_id"])
        self.assertEqual(detail["previous_request"]["reject_note"], "Cap terpotong")

        rejected_detail = self.detail(first["id"])
        self.assertEqual(rejected_detail["decision"]["status"], "REJECTED")
        self.assertEqual(rejected_detail["decision"]["reviewer"]["name"], "Reviewer")

    # ------------------------------------------------------------------
    # Extraction worker and validation (EXT, VAL)
    # ------------------------------------------------------------------
    def test_worker_extracts_and_marks_ready_for_review(self):
        body = self.upload_ok("demo-normal.pdf")
        processing = self.detail(body["id"])
        self.assertEqual(processing["status"], "QUEUED")
        self.assertEqual(processing["items"], [])

        self.assertEqual(self.run_worker(), 1)
        detail = self.detail(body["id"])
        self.assertEqual(detail["status"], "READY_FOR_REVIEW")
        self.assertEqual(detail["exceptions"], [])
        self.assertEqual(detail["vendor_name"], "PT Sinar Abadi Perkasa")
        self.assertEqual(len(detail["items"]), 3)
        self.assertEqual(Decimal(detail["subtotal_amount"]), Decimal("1125000"))
        self.assertTrue(detail["is_draft"])
        self.assertEqual(detail["version"], 2)

        extraction = self.client.get(
            f"/api/v1/invoices/{body['id']}/extraction", headers=self.auth(self.intake_a)
        ).json()
        self.assertEqual(extraction["attempts"], 1)
        self.assertEqual(extraction["result"]["invoice_number"], "INV/2026/02/0991")
        self.assertEqual(len(extraction["result"]["items"]), 3)
        ExtractedInvoice.model_validate(extraction["result"])

        actions = self.audit_actions(body["id"])
        self.assertEqual(actions[0], ("UPLOADED", "intake.a@amiga.local"))
        self.assertIn(("STATUS_CHANGED", settings.ROBOT_ADMIN_EMAIL), actions)
        self.assertEqual(len([a for a in actions if a[0] == "STATUS_CHANGED"]), 2)

    def test_multiline_items_are_all_kept(self):
        body = self.upload_ok("demo-multiline.pdf")
        self.run_worker()
        detail = self.detail(body["id"])
        self.assertEqual(detail["status"], "READY_FOR_REVIEW")
        self.assertEqual([item["line_no"] for item in detail["items"]], [1, 2, 3, 4, 5])

    def test_missing_bank_account_and_total_mismatch_raise_exception(self):
        missing = self.upload_ok("demo-missing-bank.pdf")
        mismatch = self.upload_ok("demo-total-mismatch.pdf")
        self.run_worker()

        missing_detail = self.detail(missing["id"])
        self.assertEqual(missing_detail["status"], "EXCEPTION")
        self.assertEqual(missing_detail["exception_codes"], ["MISSING_EVIDENCE"])
        self.assertEqual(missing_detail["exceptions"][0]["message"], "Nomor rekening tidak ditemukan pada invoice.")

        mismatch_detail = self.detail(mismatch["id"])
        self.assertEqual(mismatch_detail["exception_codes"], ["TOTAL_MISMATCH"])
        self.assertIn("selisih Rp500.000,00", mismatch_detail["exceptions"][0]["message"])
        self.assertIn(
            ("EXCEPTIONS_DETECTED", settings.ROBOT_ADMIN_EMAIL), self.audit_actions(mismatch["id"])
        )

    def test_duplicate_detection_ignores_rejected_documents(self):
        first = self.upload_ok("demo-duplicate-a.pdf")
        self.run_worker()
        second = self.upload_ok("demo-duplicate-b.pdf")
        self.run_worker()

        detail = self.detail(second["id"])
        self.assertEqual(detail["status"], "POSSIBLE_DUPLICATE")
        self.assertIn(first["request_id"], detail["exceptions"][0]["message"])

        with self.Session() as db:
            db.execute(
                text("UPDATE invoices SET status='REJECTED', reviewed_by=:r, reject_note='Duplikat' WHERE id IN (:a, :b)"),
                {"r": self.reviewer.id, "a": first["id"], "b": second["id"]},
            )
            db.commit()
        third = self.upload_ok("demo-duplicate-a.pdf")
        self.run_worker()
        self.assertEqual(self.detail(third["id"])["status"], "READY_FOR_REVIEW")

    def test_duplicates_are_scoped_per_client(self):
        self.upload_ok("demo-duplicate-a.pdf")
        other = self.upload_ok("demo-duplicate-b.pdf", user=self.intake_b, client=self.client_b)
        self.run_worker()
        self.assertEqual(self.detail(other["id"], user=self.intake_b)["status"], "READY_FOR_REVIEW")

    def test_failed_extraction_retries_once_then_raises_exception(self):
        recovered = self.upload_ok("demo-normal.pdf")
        self.extractor.failures["demo-normal.pdf"] = 1
        self.run_worker()
        self.assertEqual(self.detail(recovered["id"])["status"], "READY_FOR_REVIEW")

        failed = self.upload_ok("demo-multiline.pdf")
        self.extractor.failures["demo-multiline.pdf"] = 2
        self.run_worker()
        detail = self.detail(failed["id"])
        self.assertEqual(detail["status"], "EXCEPTION")
        self.assertEqual(detail["exception_codes"], ["EXTRACTION_FAILED"])
        self.assertEqual(detail["items"], [])

        extraction = self.client.get(
            f"/api/v1/invoices/{failed['id']}/extraction", headers=self.auth(self.intake_a)
        ).json()
        self.assertEqual(extraction["attempts"], 2)
        self.assertIn("ThrottlingException", extraction["error"])
        self.assertIsNone(extraction["result"])

    def test_missing_fixture_is_reported_as_extraction_failed(self):
        body = self.upload_ok("tidak-ada-fixture.pdf")
        self.run_worker()
        self.assertEqual(self.detail(body["id"])["exception_codes"], ["EXTRACTION_FAILED"])

    def test_unreadable_document(self):
        body = self.upload_ok("demo-unreadable.jpg", data=b"\xff\xd8\xff\xe0" + b"\x00" * 32)
        self.run_worker()
        detail = self.detail(body["id"])
        self.assertEqual(detail["status"], "EXCEPTION")
        self.assertEqual(detail["exception_codes"], ["UNREADABLE_DOCUMENT"])
        self.assertEqual(detail["exceptions"][0]["message"], "Dokumen tidak terbaca jelas.")

    def test_requeue_extraction_only_after_failure(self):
        ok = self.upload_ok("demo-normal.pdf")
        failed = self.upload_ok("demo-multiline.pdf")
        self.extractor.failures["demo-multiline.pdf"] = 2
        self.run_worker()

        conflict = self.client.post(f"/api/v1/invoices/{ok['id']}/extraction", headers=self.auth(self.intake_a))
        self.assertEqual(conflict.status_code, 409)

        requeued = self.client.post(f"/api/v1/invoices/{failed['id']}/extraction", headers=self.auth(self.intake_a))
        self.assertEqual(requeued.status_code, 202, requeued.text)
        self.assertEqual(requeued.json()["status"], "QUEUED")
        self.assertEqual(requeued.json()["exceptions"], [])

        self.run_worker()
        detail = self.detail(failed["id"])
        self.assertEqual(detail["status"], "READY_FOR_REVIEW")
        self.assertEqual(len(detail["items"]), 5)
        self.assertIn(("EXTRACTION_REQUEUED", "intake.a@amiga.local"), self.audit_actions(failed["id"]))

    def test_claim_skips_rows_locked_by_another_worker(self):
        body = self.upload_ok()
        with self.Session() as holder:
            holder.query(Invoice).filter(Invoice.id == uuid.UUID(body["id"])).with_for_update().one()
            with self.Session() as db:
                self.assertIsNone(claim_next(db))
        with self.Session() as db:
            self.assertEqual(str(claim_next(db)), body["id"])
            self.assertIsNone(claim_next(db))

    # ------------------------------------------------------------------
    # Queue, detail, client isolation (QUE, ACC-03, REV-08, AUD-05)
    # ------------------------------------------------------------------
    def test_client_isolation_on_every_endpoint(self):
        body = self.upload_ok()
        headers = self.auth(self.intake_b)
        for path in ("", "/file-url", "/history", "/extraction"):
            response = self.client.get(f"/api/v1/invoices/{body['id']}{path}", headers=headers)
            self.assertEqual(response.status_code, 403, path)
            self.assertNotIn(body["request_id"], response.text)
        self.assertEqual(
            self.client.post(f"/api/v1/invoices/{body['id']}/extraction", headers=headers).status_code, 403
        )
        listing = self.client.get(f"/api/v1/invoices?client_id={self.client_a.id}", headers=headers)
        self.assertEqual(listing.status_code, 403)
        self.assertEqual(self.client.get("/api/v1/invoices", headers=headers).json()["total"], 0)

    def test_queue_filters_and_pagination(self):
        self.upload_ok("demo-normal.pdf")
        self.upload_ok("demo-missing-bank.pdf")
        self.upload_ok("demo-total-mismatch.pdf", client=self.client_c)
        self.run_worker()
        self.upload_ok("demo-multiline.pdf")
        headers = self.auth(self.intake_a)

        def fetch(query=""):
            response = self.client.get(f"/api/v1/invoices{query}", headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()

        everything = fetch()
        self.assertEqual(everything["total"], 4)
        self.assertEqual(everything["items"][0]["status"], "QUEUED")  # newest first

        self.assertEqual(fetch("?status=EXCEPTION")["total"], 2)
        self.assertEqual(fetch("?issue=MISSING_EVIDENCE")["total"], 1)
        no_reviewer = fetch("?issue=NO_REVIEWER")
        self.assertEqual(no_reviewer["total"], 1)
        self.assertFalse(no_reviewer["items"][0]["has_reviewer"])
        self.assertEqual(fetch(f"?client_id={self.client_c.id}")["total"], 1)
        self.assertEqual(fetch("?date_from=2026-02-25")["total"], 0)
        self.assertEqual(fetch("?date_from=2026-02-24&date_to=2026-02-24")["total"], 4)

        page = fetch("?limit=3&skip=3")
        self.assertEqual((page["total"], len(page["items"])), (4, 1))
        self.assertEqual(self.client.get("/api/v1/invoices?issue=BOGUS", headers=headers).status_code, 422)

    def test_assigned_clients_flag_missing_reviewer(self):
        clients = self.client.get("/api/v1/me/clients", headers=self.auth(self.intake_a)).json()
        self.assertEqual(
            [(c["code"], c["has_reviewer"]) for c in clients], [("CL-A", True), ("CL-C", False)]
        )

    def test_file_url_and_history(self):
        body = self.upload_ok()
        self.run_worker()
        headers = self.auth(self.intake_a)

        file_url = self.client.get(f"/api/v1/invoices/{body['id']}/file-url", headers=headers).json()
        self.assertTrue(file_url["url"].startswith(f"https://s3.test/clients/{self.client_a.id}/"))
        self.assertEqual(file_url["expires_in"], settings.S3_PRESIGNED_URL_EXPIRE_SECONDS)

        history = self.client.get(f"/api/v1/invoices/{body['id']}/history", headers=headers).json()
        self.assertEqual(history[-1]["action"], "UPLOADED")
        self.assertFalse(history[-1]["user"]["is_system"])
        self.assertTrue(any(entry["user"]["is_system"] for entry in history))
        # Opening the original file is not audited (AUD-01).
        self.assertNotIn("FILE_VIEWED", {entry["action"] for entry in history})


class ValidationRulesTestCase(unittest.TestCase):
    def test_normalization(self):
        self.assertEqual(normalize_key("PT. Multi Teknik-Prima"), normalize_key("pt multi teknik prima"))
        self.assertEqual(normalize_key(" MTP 891/26 "), "mtp89126")
        self.assertEqual(normalize_bank_account("BNI 0091-882-771"), "0091882771")
        self.assertEqual(normalize_bank_account("tidak ada"), "")

    def test_status_priority(self):
        self.assertEqual(resolve_status([]), InvoiceStatus.READY_FOR_REVIEW)
        self.assertEqual(resolve_status(["MISSING_EVIDENCE"]), InvoiceStatus.EXCEPTION)
        self.assertEqual(
            resolve_status(["MISSING_EVIDENCE", "POSSIBLE_DUPLICATE"]), InvoiceStatus.POSSIBLE_DUPLICATE
        )

    def test_request_id_format_regex(self):
        self.assertTrue(re.fullmatch(r"REQ-\d{4}-\d{6}", f"REQ-2026-{42:06d}"))


if __name__ == "__main__":
    unittest.main()
