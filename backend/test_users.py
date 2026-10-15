import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.security import hash_password
from database import Base, get_db
from main import app
from models.user import User, UserRole


class UserApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine, tables=[User.__table__])

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
        Base.metadata.drop_all(bind=cls.engine, tables=[User.__table__])
        cls.engine.dispose()

    def setUp(self):
        with self.Session() as db:
            db.query(User).delete()
            db.add_all(
                [
                    User(
                        name="System Admin",
                        email="admin@example.com",
                        password_hash=hash_password("Password123!"),
                        role=UserRole.SYSTEM_ADMIN,
                    ),
                    User(
                        name="Intake",
                        email="intake@example.com",
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
        intake_headers = self.auth(self.token_for("intake@example.com"))
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
        admin_headers = self.auth(self.token_for("admin@example.com"))
        created = self.client.post(
            "/api/v1/users",
            headers=admin_headers,
            json={
                "name": "Finance Reviewer",
                "email": "REVIEWER@example.com",
                "password": "Password123!",
                "role": "FINANCE_REVIEWER",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        user_id = created.json()["id"]
        self.assertEqual(created.json()["email"], "reviewer@example.com")
        self.assertNotIn("password", created.json())
        self.assertNotIn("password_hash", created.json())

        listed = self.client.get("/api/v1/users", headers=admin_headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 3)

        updated = self.client.put(
            f"/api/v1/users/{user_id}",
            headers=admin_headers,
            json={"name": "Reviewer Updated", "role": "SERVICE_LEAD"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["name"], "Reviewer Updated")
        self.assertEqual(updated.json()["role"], "SERVICE_LEAD")

        reviewer_token = self.token_for("reviewer@example.com")
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
        admin_headers = self.auth(self.token_for("admin@example.com"))
        duplicate = self.client.post(
            "/api/v1/users",
            headers=admin_headers,
            json={
                "name": "Duplicate",
                "email": "ADMIN@example.com",
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


if __name__ == "__main__":
    unittest.main()
