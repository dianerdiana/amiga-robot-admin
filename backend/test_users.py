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


class UserApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        cls.tables = [User.__table__, Client.__table__, UserClient.__table__]
        Base.metadata.create_all(bind=cls.engine, tables=cls.tables)

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
        Base.metadata.drop_all(bind=cls.engine, tables=list(reversed(cls.tables)))
        cls.engine.dispose()

    def setUp(self):
        with self.Session() as db:
            db.query(UserClient).delete()
            db.query(Client).delete()
            db.query(User).delete()
            db.add_all(
                [
                    User(
                        name="System Admin",
                        email="admin@amiga.local",
                        password_hash=hash_password("Password123!"),
                        role=UserRole.SYSTEM_ADMIN,
                    ),
                    User(
                        name="Intake",
                        email="intake@amiga.local",
                        password_hash=hash_password("Password123!"),
                        role=UserRole.INTAKE,
                    ),
                ]
            )
            db.commit()

    def token_for(self, email: str) -> str:
        response = self.client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "Password123!"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    @staticmethod
    def auth(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_all_user_routes_require_system_admin(self):
        intake_headers = self.auth(self.token_for("intake@amiga.local"))
        response = self.client.get("/api/v1/users", headers=intake_headers)
        self.assertEqual(response.status_code, 403)

        response = self.client.post(
            "/api/v1/users",
            headers=intake_headers,
            json={
                "name": "Reviewer",
                "email": "reviewer@example.com",
                "password": "Password123!",
                "role": "FINANCE_REVIEWER",
            },
        )
        self.assertEqual(response.status_code, 403)

    def test_system_admin_can_crud_users_and_deactivation_is_immediate(self):
        admin_headers = self.auth(self.token_for("admin@amiga.local"))
        created = self.client.post(
            "/api/v1/users",
            headers=admin_headers,
            json={
                "name": "Finance Reviewer",
                "email": "REVIEWER@amiga.local",
                "password": "Password123!",
                "role": "FINANCE_REVIEWER",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        user_id = created.json()["id"]
        self.assertEqual(created.json()["email"], "reviewer@amiga.local")
        self.assertNotIn("password", created.json())
        self.assertNotIn("password_hash", created.json())

        listed = self.client.get("/api/v1/users", headers=admin_headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json()["total"], 3)
        self.assertEqual(len(listed.json()["items"]), 3)

        updated = self.client.put(
            f"/api/v1/users/{user_id}",
            headers=admin_headers,
            json={"name": "Reviewer Updated", "role": "SERVICE_LEAD"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["name"], "Reviewer Updated")
        self.assertEqual(updated.json()["role"], "SERVICE_LEAD")

        reviewer_token = self.token_for("reviewer@amiga.local")
        deleted = self.client.delete(
            f"/api/v1/users/{user_id}", headers=admin_headers
        )
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertFalse(deleted.json()["is_active"])

        denied = self.client.get(
            "/api/v1/auth/me", headers=self.auth(reviewer_token)
        )
        self.assertEqual(denied.status_code, 403)

    def test_duplicate_email_and_robot_role_are_rejected(self):
        admin_headers = self.auth(self.token_for("admin@amiga.local"))
        duplicate = self.client.post(
            "/api/v1/users",
            headers=admin_headers,
            json={
                "name": "Duplicate",
                "email": "ADMIN@amiga.local",
                "password": "Password123!",
                "role": "INTAKE",
            },
        )
        self.assertEqual(duplicate.status_code, 409, duplicate.text)

        robot = self.client.post(
            "/api/v1/users",
            headers=admin_headers,
            json={
                "name": "Robot",
                "email": "robot@example.com",
                "password": "Password123!",
                "role": "ROBOT_ADMIN",
            },
        )
        self.assertEqual(robot.status_code, 422, robot.text)

    def test_invalid_email_format_is_rejected(self):
        admin_headers = self.auth(self.token_for("admin@amiga.local"))
        response = self.client.post(
            "/api/v1/users",
            headers=admin_headers,
            json={
                "name": "Invalid Email",
                "email": "bukan-email",
                "password": "Password123!",
                "role": "INTAKE",
            },
        )
        self.assertEqual(response.status_code, 422, response.text)

    def test_user_list_is_filtered_paginated_and_includes_client_assignments(self):
        with self.Session() as db:
            intake = db.query(User).filter(User.email == "intake@amiga.local").one()
            client = Client(code="CLI-001", name="PT Contoh", is_active=True)
            db.add(client)
            db.flush()
            db.add(UserClient(user_id=intake.id, client_id=client.id))
            db.commit()

        admin_headers = self.auth(self.token_for("admin@amiga.local"))
        response = self.client.get(
            "/api/v1/users?page=1&page_size=1&search=intake&role=INTAKE&is_active=true",
            headers=admin_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["page"], 1)
        self.assertEqual(payload["page_size"], 1)
        self.assertEqual(payload["total_pages"], 1)
        self.assertEqual(payload["active_count"], 2)
        self.assertEqual(payload["inactive_count"], 0)
        self.assertEqual(payload["items"][0]["assigned_clients"][0]["name"], "PT Contoh")


if __name__ == "__main__":
    unittest.main()
