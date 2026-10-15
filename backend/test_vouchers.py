"""Tests for Buat Voucher (UC-2, VCH-01 to VCH-10) and the voucher PDF.

Uses the same PostgreSQL setup as test_invoices.py:

    TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/amiga_robot_admin_test \
        python -m unittest test_vouchers
"""

import threading
import time
import unittest
import uuid
from datetime import date
from decimal import Decimal
from unittest import mock

from fastapi import HTTPException

from models.audit_log import AuditLog
from models.invoice import Invoice, InvoiceStatus
from models.invoice_item import InvoiceItem
from models.user import User
from models.user_client import UserClient
from models.voucher import Voucher
from schemas.voucher import VoucherCreate
from services.voucher_pdf import VoucherPdfData, VoucherPdfInvoice, VoucherPdfItem, format_quantity, render_voucher_pdf
from services.voucher_service import VoucherService
from test_invoices import InvoiceTestBase

VENDOR = "PT Sinar Abadi Perkasa"
BANK = "Bank Mandiri 137-00-1928371-2"
PURPOSE = "Pembayaran ATK kantor cabang Sudirman"


class VoucherTestBase(InvoiceTestBase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch("services.voucher_service.get_s3_client", return_value=self.s3)
        patcher.start()
        self.addCleanup(patcher.stop)
        self._seq = 0

    def reviewed(self, *, client=None, vendor=VENDOR, bank=BANK, total="1248750", status=InvoiceStatus.AMIGA_REVIEWED, items=2) -> Invoice:
        """Insert an approved invoice directly; the review pipeline itself is covered by test_invoices."""
        client = client or self.client_a
        self._seq += 1
        with self.Session() as db:
            invoice = Invoice(
                request_id=f"REQ-2026-{900000 + self._seq}",
                client_id=client.id,
                uploaded_by=self.intake_a.id,
                reviewed_by=self.reviewer.id if status != InvoiceStatus.READY_FOR_REVIEW else None,
                request_type="Pembayaran Vendor",
                channel="WhatsApp",
                request_date=date(2026, 2, 24),
                vendor_name=vendor,
                invoice_number=f"INV/2026/{self._seq:04d}",
                invoice_date=date(2026, 2, self._seq % 27 + 1),
                bank_account=bank,
                tax_amount=Decimal("0"),
                total_amount=Decimal(total) if total is not None else None,
                file_key=f"clients/{client.id}/invoices/{self._seq}.pdf",
                original_filename=f"inv-{self._seq}.pdf",
                mime_type="application/pdf",
                status=status,
            )
            invoice.items = [
                InvoiceItem(line_no=n, description=f"Barang {n}", quantity=Decimal("1"), unit_price=Decimal("100"), amount=Decimal("100"))
                for n in range(1, items + 1)
            ]
            db.add(invoice)
            db.commit()
            db.refresh(invoice)
            db.expunge(invoice)
            return invoice

    def create(self, invoices, user=None, client=None, purpose=PURPOSE):
        return self.client.post(
            "/api/v1/vouchers",
            headers=self.auth(user or self.intake_a),
            json={
                "client_id": str((client or self.client_a).id),
                "invoice_ids": [str(invoice.id) for invoice in invoices],
                "purpose": purpose,
            },
        )

    def invoice_row(self, invoice_id) -> Invoice:
        with self.Session() as db:
            return db.get(Invoice, invoice_id)


class VoucherFormDataTestCase(VoucherTestBase):
    """VCH-01 and VCH-02: vendor options and eligible invoices."""

    def get(self, path, user=None, **params):
        return self.client.get(f"/api/v1/vouchers/{path}", headers=self.auth(user or self.intake_a), params=params)

    def test_vendors_are_grouped_after_normalization(self):
        self.reviewed(vendor="PT Sinar Abadi Perkasa")
        self.reviewed(vendor="PT. SINAR ABADI PERKASA")
        self.reviewed(vendor="CV Bahtera Mandiri")
        self.reviewed(vendor="PT Lain", status=InvoiceStatus.READY_FOR_REVIEW)
        self.reviewed(vendor="PT Klien B", client=self.client_b)

        response = self.get("vendors", client_id=str(self.client_a.id))
        self.assertEqual(response.status_code, 200, response.text)
        vendors = {vendor["key"]: vendor["invoice_count"] for vendor in response.json()}
        self.assertEqual(vendors, {"ptsinarabadiperkasa": 2, "cvbahteramandiri": 1})

    def test_eligible_invoices_exclude_vouchered_and_other_statuses(self):
        first = self.reviewed()
        second = self.reviewed(bank="BCA 8830192841")
        self.reviewed(status=InvoiceStatus.READY_FOR_REVIEW)
        used = self.reviewed()
        self.assertEqual(self.create([used]).status_code, 201)

        response = self.get("eligible-invoices", client_id=str(self.client_a.id), vendor_key="ptsinarabadiperkasa")
        self.assertEqual(response.status_code, 200, response.text)
        rows = {row["id"]: row for row in response.json()}
        self.assertEqual(set(rows), {str(first.id), str(second.id)})
        self.assertEqual(rows[str(first.id)]["bank_key"], "1370019283712")
        self.assertEqual(rows[str(first.id)]["item_count"], 2)

    def test_client_isolation_and_role(self):
        self.reviewed(client=self.client_b)
        denied = self.get("vendors", client_id=str(self.client_b.id))
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.get("vendors", user=self.reviewer, client_id=str(self.client_a.id)).status_code, 403)
        self.assertEqual(
            self.get("eligible-invoices", user=self.intake_a, client_id=str(self.client_b.id), vendor_key="x").status_code,
            403,
        )


class VoucherCreateTestCase(VoucherTestBase):
    """VCH-03 to VCH-09: atomic creation."""

    def test_create_voucher_from_two_invoices(self):
        first = self.reviewed(total="1248750")
        second = self.reviewed(total="3450000", vendor="PT. Sinar Abadi Perkasa", bank="Mandiri 137-00-19283712")

        response = self.create([second, first])
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        year = time.localtime().tm_year
        self.assertEqual(body["voucher_number"], f"VCH-CL-A-{year}-00001")
        self.assertEqual(Decimal(body["total_amount"]), Decimal("4698750"))
        self.assertEqual(body["status"], "CREATED")
        self.assertEqual(body["purpose"], PURPOSE)
        self.assertEqual(len(body["invoices"]), 2)

        for invoice in (first, second):
            row = self.invoice_row(invoice.id)
            self.assertEqual(row.status, InvoiceStatus.VOUCHERED)
            self.assertEqual(str(row.voucher_id), body["id"])
            self.assertEqual(row.version, invoice.version + 1)

        key = f"clients/{self.client_a.id}/vouchers/{body['id']}.pdf"
        self.assertTrue(self.s3.objects[key].startswith(b"%PDF-"))

        with self.Session() as db:
            actions = {
                (row.entity_type, row.action, row.new_value)
                for row in db.query(AuditLog).filter(AuditLog.user_id == self.intake_a.id)
            }
        self.assertIn(("voucher", "VOUCHER_CREATED", "CREATED"), actions)
        self.assertIn(("invoice", "STATUS_CHANGED", "VOUCHERED"), actions)
        self.assertIn(("invoice", "VOUCHER_ASSIGNED", body["voucher_number"]), actions)

    def test_numbers_are_sequential_per_client(self):
        year = time.localtime().tm_year
        numbers = [self.create([self.reviewed()]).json()["voucher_number"] for _ in range(2)]
        self.assertEqual(numbers, [f"VCH-CL-A-{year}-00001", f"VCH-CL-A-{year}-00002"])

        with self.Session() as db:
            db.add(UserClient(user_id=self.intake_a.id, client_id=self.client_b.id))
            db.commit()
        other = self.create([self.reviewed(client=self.client_b)], client=self.client_b)
        self.assertEqual(other.json()["voucher_number"], f"VCH-CL-B-{year}-00001")

    def test_used_or_unapproved_invoice_is_rejected(self):
        used = self.reviewed()
        self.assertEqual(self.create([used]).status_code, 201)
        fresh = self.reviewed()

        again = self.create([fresh, used])
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.json()["detail"], "Invoice sudah masuk voucher lain, muat ulang daftar.")
        self.assertEqual(self.invoice_row(fresh.id).status, InvoiceStatus.AMIGA_REVIEWED)

        pending = self.reviewed(status=InvoiceStatus.READY_FOR_REVIEW)
        self.assertEqual(self.create([pending]).status_code, 409)
        # An invoice of another client cannot be smuggled in under an assigned client_id.
        foreign = self.reviewed(client=self.client_b)
        self.assertEqual(self.create([foreign]).status_code, 409)
        self.assertEqual(self.invoice_row(foreign.id).status, InvoiceStatus.AMIGA_REVIEWED)

    def test_mixed_vendor_or_bank_account_is_rejected(self):
        base = self.reviewed()
        other_bank = self.reviewed(bank="BCA 8830192841")
        other_vendor = self.reviewed(vendor="CV Bahtera Mandiri")

        bank = self.create([base, other_bank])
        self.assertEqual(bank.status_code, 422)
        self.assertIn("rekening", bank.json()["detail"])
        vendor = self.create([base, other_vendor])
        self.assertEqual(vendor.status_code, 422)
        self.assertIn("vendor", vendor.json()["detail"])
        self.assertEqual(self.invoice_row(base.id).status, InvoiceStatus.AMIGA_REVIEWED)

        no_bank = self.reviewed(bank=None)
        self.assertEqual(self.create([no_bank]).status_code, 422)

    def test_purpose_and_payload_validation(self):
        invoice = self.reviewed()
        empty = self.create([invoice], purpose="   ")
        self.assertEqual(empty.status_code, 422)
        self.assertEqual(empty.json()["detail"][0]["msg"], "Peruntukan wajib diisi.")
        self.assertEqual(self.create([invoice], purpose="x" * 256).status_code, 422)
        self.assertEqual(self.create([]).status_code, 422)
        self.assertEqual(self.create([invoice, invoice]).status_code, 422)

    def test_access_and_role_guards(self):
        invoice = self.reviewed()
        self.assertEqual(self.create([invoice], user=self.reviewer).status_code, 403)
        foreign = self.reviewed(client=self.client_b)
        self.assertEqual(self.create([foreign], client=self.client_b).status_code, 403)

    def test_storage_failure_saves_nothing(self):
        invoice = self.reviewed()
        self.s3.fail_put = True
        response = self.create([invoice])
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Voucher gagal dibuat, coba lagi.")
        with self.Session() as db:
            self.assertEqual(db.query(Voucher).count(), 0)
        self.assertEqual(self.invoice_row(invoice.id).status, InvoiceStatus.AMIGA_REVIEWED)

        # The failed attempt does not consume a number.
        self.s3.fail_put = False
        year = time.localtime().tm_year
        self.assertEqual(self.create([invoice]).json()["voucher_number"], f"VCH-CL-A-{year}-00001")

    def test_concurrent_creates_use_an_invoice_once(self):
        shared = self.reviewed()
        results: list[object] = []
        barrier = threading.Barrier(2)

        def attempt():
            with self.Session() as db:
                user = db.get(User, self.intake_a.id)
                barrier.wait()
                try:
                    results.append(VoucherService.create(db, user, VoucherCreate(
                        client_id=self.client_a.id, invoice_ids=[shared.id], purpose=PURPOSE,
                    )).voucher_number)
                except HTTPException as exc:
                    results.append(exc.status_code)

        threads = [threading.Thread(target=attempt) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        self.assertEqual(sorted(results, key=str).count(409), 1, results)
        with self.Session() as db:
            self.assertEqual(db.query(Voucher).count(), 1)


class VoucherListTestCase(VoucherTestBase):
    """UC-10: list of vouchers for the assigned clients."""

    def list(self, user=None, **params):
        return self.client.get("/api/v1/vouchers", headers=self.auth(user or self.intake_a), params=params)

    def test_lists_assigned_clients_newest_first(self):
        first = self.create([self.reviewed(), self.reviewed()]).json()
        second = self.create([self.reviewed()]).json()
        with self.Session() as db:
            db.add(UserClient(user_id=self.intake_b.id, client_id=self.client_a.id))
            db.commit()
        foreign = self.create([self.reviewed(client=self.client_b)], user=self.intake_b, client=self.client_b)
        self.assertEqual(foreign.status_code, 201, foreign.text)

        response = self.list()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["total"], 2)
        self.assertEqual([row["id"] for row in body["items"]], [second["id"], first["id"]])
        self.assertEqual([row["invoice_count"] for row in body["items"]], [1, 2])
        self.assertEqual(body["items"][0]["status"], "CREATED")
        self.assertEqual(body["items"][0]["purpose"], PURPOSE)

        page = self.list(limit=1, skip=1).json()
        self.assertEqual((page["total"], len(page["items"])), (2, 1))
        self.assertEqual(page["items"][0]["id"], first["id"])

        only_a = self.list(client_id=str(self.client_a.id)).json()
        self.assertEqual(only_a["total"], 2)

    def test_access_guards(self):
        self.assertEqual(self.list(client_id=str(self.client_b.id)).status_code, 403)
        self.assertEqual(self.list(user=self.reviewer).status_code, 403)
        empty = self.list(user=self.intake_b).json()
        self.assertEqual((empty["total"], empty["items"]), (0, []))


class VoucherDownloadTestCase(VoucherTestBase):
    """UC-9: download, first-download status change, and the voucher detail (UC-10 step 3)."""

    def download(self, voucher_id, user=None):
        return self.client.post(f"/api/v1/vouchers/{voucher_id}/download", headers=self.auth(user or self.intake_a))

    def voucher_actions(self, voucher_id) -> list[tuple[str, str | None]]:
        with self.Session() as db:
            rows = (
                db.query(AuditLog.action, AuditLog.new_value)
                .filter(AuditLog.entity_type == "voucher", AuditLog.entity_id == uuid.UUID(voucher_id))
                .order_by(AuditLog.created_at, AuditLog.id)
                .all()
            )
        return [(row.action, row.new_value) for row in rows]

    def test_first_download_sends_and_redownload_keeps_status(self):
        invoices = [self.reviewed(), self.reviewed()]
        voucher = self.create(invoices).json()
        presign = mock.Mock(side_effect=self.s3.generate_presigned_url)
        self.s3.generate_presigned_url = presign

        first = self.download(voucher["id"])
        self.assertEqual(first.status_code, 200, first.text)
        body = first.json()
        self.assertTrue(body["first_download"])
        self.assertEqual(body["filename"], f"{voucher['voucher_number']}.pdf")
        self.assertEqual(body["voucher"]["status"], "SENT_TO_CLIENT")
        self.assertIsNotNone(body["voucher"]["sent_at"])
        self.assertEqual({row["status"] for row in body["voucher"]["invoices"]}, {"SENT_TO_CLIENT"})
        params = presign.call_args.kwargs["Params"]
        self.assertEqual(params["ResponseContentDisposition"], f'attachment; filename="{body["filename"]}"')
        for invoice in invoices:
            row = self.invoice_row(invoice.id)
            self.assertEqual(row.status, InvoiceStatus.SENT_TO_CLIENT)
            self.assertEqual(row.version, invoice.version + 2)  # VOUCHERED, then SENT_TO_CLIENT

        again = self.download(voucher["id"])
        self.assertEqual(again.status_code, 200, again.text)
        self.assertFalse(again.json()["first_download"])
        self.assertEqual(again.json()["voucher"]["sent_at"], body["voucher"]["sent_at"])
        self.assertEqual(self.invoice_row(invoices[0].id).version, invoices[0].version + 2)

        actions = self.voucher_actions(voucher["id"])
        self.assertIn(("STATUS_CHANGED", "SENT_TO_CLIENT"), actions)
        self.assertEqual(
            [value for action, value in actions if action == "VOUCHER_DOWNLOADED"], ["pertama", "ulang"]
        )

    def test_missing_file_changes_nothing(self):
        voucher = self.create([self.reviewed()]).json()
        self.s3.objects.clear()
        response = self.download(voucher["id"])
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Berkas voucher tidak dapat diambil, coba lagi.")
        detail = self.client.get(f"/api/v1/vouchers/{voucher['id']}", headers=self.auth(self.intake_a)).json()
        self.assertEqual(detail["status"], "CREATED")
        self.assertNotIn("VOUCHER_DOWNLOADED", {action for action, _ in self.voucher_actions(voucher["id"])})

    def test_access_guards(self):
        voucher = self.create([self.reviewed()]).json()
        self.assertEqual(self.download(voucher["id"], user=self.reviewer).status_code, 403)
        self.assertEqual(self.download(voucher["id"], user=self.intake_b).status_code, 403)
        self.assertEqual(
            self.client.get(f"/api/v1/vouchers/{voucher['id']}", headers=self.auth(self.intake_b)).status_code, 403
        )
        self.assertEqual(self.download(uuid.uuid4()).status_code, 404)

    def test_detail_includes_line_items(self):
        voucher = self.create([self.reviewed(items=3), self.reviewed(items=1)]).json()
        detail = self.client.get(f"/api/v1/vouchers/{voucher['id']}", headers=self.auth(self.intake_a))
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual(sorted(len(row["items"]) for row in detail.json()["invoices"]), [1, 3])
        self.assertEqual({row["status"] for row in detail.json()["invoices"]}, {"VOUCHERED"})

    def test_concurrent_first_downloads_change_status_once(self):
        voucher = self.create([self.reviewed()]).json()
        results: list[object] = []
        barrier = threading.Barrier(2)

        def attempt():
            with self.Session() as db:
                user = db.get(User, self.intake_a.id)
                barrier.wait()
                try:
                    results.append(VoucherService.download(db, user, uuid.UUID(voucher["id"])).first_download)
                except HTTPException as exc:
                    results.append(exc.status_code)

        threads = [threading.Thread(target=attempt) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        self.assertEqual(sorted(results, key=str), [False, True])
        changes = [a for a in self.voucher_actions(voucher["id"]) if a == ("STATUS_CHANGED", "SENT_TO_CLIENT")]
        self.assertEqual(len(changes), 1)


class VoucherPdfTestCase(unittest.TestCase):
    def test_pdf_contains_template_elements(self):
        items = [VoucherPdfItem(n, f"Barang <{n}> & co", Decimal("2.5"), Decimal("1000"), Decimal("2500")) for n in range(1, 4)]
        data = VoucherPdfData(
            voucher_number="VCH-CL-A-2026-00007",
            client_name="Klien A",
            vendor_name=VENDOR,
            bank_account=BANK,
            purpose=PURPOSE,
            created_date=date(2026, 10, 16),
            total_amount=Decimal("1250000"),
            invoices=[
                VoucherPdfInvoice("INV/1", date(2026, 2, 18), Decimal("0"), Decimal("0"), Decimal("7500"), items),
                VoucherPdfInvoice("INV/2", None, None, Decimal("500"), Decimal("1242500"), []),
            ],
        )
        started = time.perf_counter()
        pdf = render_voucher_pdf(data, compress=False)
        self.assertLess(time.perf_counter() - started, 3)  # VCH-11
        self.assertTrue(pdf.startswith(b"%PDF-"))
        for text in (b"VCH-CL-A-2026-00007", b"16/10/2026", b"Rp1.250.000,00", b"Peruntukan", b"TEMPLATE SEMENTARA"):
            self.assertIn(text, pdf)

    def test_quantity_format(self):
        self.assertEqual(format_quantity(Decimal("1250.5000")), "1.250,5")
        self.assertEqual(format_quantity(Decimal("10.0000")), "10")
        self.assertEqual(format_quantity(None), "-")


if __name__ == "__main__":
    unittest.main()
