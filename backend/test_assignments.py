import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.security import hash_password
from database import Base, get_db
from main import app
from models.client import Client
from models.user import User, UserRole
from models.user_client import UserClient


class AssignmentApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine, tables=[User.__table__, Client.__table__, UserClient.__table__])

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
        Base.metadata.drop_all(bind=cls.engine, tables=[UserClient.__table__, Client.__table__, User.__table__])
        cls.engine.dispose()

    def setUp(self):
        with self.Session() as db:
            db.query(UserClient).delete()
            db.query(Client).delete()
            db.query(User).delete()
            db.add_all([
                Client(code="CL-001", name="PT AMIGA"),
                Client(code="CL-002", name="PT Tanpa Reviewer"),
            ])
            db.add_all([
                User(name="Admin", email="admin@amiga.local", password_hash=hash_password("Password123!"), role=UserRole.SYSTEM_ADMIN),
                User(name="Intake", email="intake@amiga.local", password_hash=hash_password("Password123!"), role=UserRole.INTAKE),
                User(name="Reviewer", email="reviewer@amiga.local", password_hash=hash_password("Password123!"), role=UserRole.FINANCE_REVIEWER),
                User(name="Lead", email="lead@amiga.local", password_hash=hash_password("Password123!"), role=UserRole.SERVICE_LEAD),
            ])
            db.commit()

    def token_for(self, email: str) -> str:
        response = self.client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    @staticmethod
    def auth(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_role_scoped_assignment_lifecycle(self):
        with self.Session() as db:
            client_id = str(db.query(Client).filter_by(code="CL-001").one().id)
            intake_id = str(db.query(User).filter_by(email="intake@amiga.local").one().id)
            reviewer_id = str(db.query(User).filter_by(email="reviewer@amiga.local").one().id)

        admin_headers = self.auth(self.token_for("admin@amiga.local"))
        lead_headers = self.auth(self.token_for("lead@amiga.local"))
        intake_headers = self.auth(self.token_for("intake@amiga.local"))

        assigned_intake = self.client.post(f"/api/v1/clients/{client_id}/assignments", headers=admin_headers, json={"user_id": intake_id})
        self.assertEqual(assigned_intake.status_code, 201, assigned_intake.text)
        self.assertEqual(assigned_intake.json()["user_id"], intake_id)

        duplicate = self.client.post(f"/api/v1/clients/{client_id}/assignments", headers=admin_headers, json={"user_id": intake_id})
        self.assertEqual(duplicate.status_code, 409, duplicate.text)

        admin_reviewer = self.client.post(f"/api/v1/clients/{client_id}/assignments", headers=admin_headers, json={"user_id": reviewer_id})
        self.assertEqual(admin_reviewer.status_code, 403, admin_reviewer.text)

        assigned_reviewer = self.client.post(f"/api/v1/clients/{client_id}/assignments", headers=lead_headers, json={"user_id": reviewer_id})
        self.assertEqual(assigned_reviewer.status_code, 201, assigned_reviewer.text)

        listed = self.client.get(f"/api/v1/clients/{client_id}/assignments", headers=admin_headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual({user["role"] for user in listed.json()["users"]}, {"INTAKE", "FINANCE_REVIEWER"})

        denied = self.client.get(f"/api/v1/clients/{client_id}/assignments", headers=intake_headers)
        self.assertEqual(denied.status_code, 403, denied.text)

        unassigned = self.client.delete(f"/api/v1/clients/{client_id}/assignments/{intake_id}", headers=admin_headers)
        self.assertEqual(unassigned.status_code, 204, unassigned.text)

    def test_service_lead_lists_and_assigns_active_reviewers_per_client(self):
        with self.Session() as db:
            client_id = str(db.query(Client).filter_by(code="CL-001").one().id)
            reviewer_id = str(db.query(User).filter_by(email="reviewer@amiga.local").one().id)

        lead_headers = self.auth(self.token_for("lead@amiga.local"))
        admin_headers = self.auth(self.token_for("admin@amiga.local"))

        assigned = self.client.post(
            f"/api/v1/clients/{client_id}/reviewers",
            headers=lead_headers,
            json={"reviewer_id": reviewer_id},
        )
        self.assertEqual(assigned.status_code, 201, assigned.text)
        self.assertEqual(assigned.json(), {"client_id": client_id, "user_id": reviewer_id})

        response = self.client.get("/api/v1/clients/reviewer-assignments", headers=lead_headers)
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        clients = {item["client_code"]: item for item in payload["items"]}
        self.assertEqual(payload["assigned_count"], 1)
        self.assertEqual(payload["unassigned_count"], 1)
        self.assertEqual(clients["CL-001"]["assignment_status"], "ASSIGNED")
        self.assertEqual(clients["CL-001"]["active_reviewers"][0]["email"], "reviewer@amiga.local")
        self.assertEqual(clients["CL-002"]["assignment_status"], "UNASSIGNED")
        self.assertEqual(clients["CL-002"]["active_reviewers"], [])

        forbidden = self.client.get("/api/v1/clients/reviewer-assignments", headers=admin_headers)
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

        options = self.client.get("/api/v1/clients/reviewer-options", headers=lead_headers)
        self.assertEqual(options.status_code, 200, options.text)
        self.assertEqual(options.json()[0]["email"], "reviewer@amiga.local")


if __name__ == "__main__":
    unittest.main()
