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


class ClientApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine, tables=[User.__table__, Client.__table__])

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
        Base.metadata.drop_all(bind=cls.engine, tables=[Client.__table__, User.__table__])
        cls.engine.dispose()

    def setUp(self):
        with self.Session() as db:
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

    def test_all_client_routes_require_system_admin(self):
        headers = self.auth(self.token_for("intake@amiga.local"))
        self.assertEqual(self.client.get("/api/v1/clients", headers=headers).status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/v1/clients",
                headers=headers,
                json={"code": "CL-001", "name": "PT Intake"},
            ).status_code,
            403,
        )

    def test_system_admin_can_crud_clients_and_deactivate(self):
        headers = self.auth(self.token_for("admin@amiga.local"))
        created = self.client.post(
            "/api/v1/clients",
            headers=headers,
            json={"code": " cl-001 ", "name": " PT AMIGA "},
        )
        self.assertEqual(created.status_code, 201, created.text)
        client_id = created.json()["id"]
        self.assertEqual(created.json()["code"], "CL-001")
        self.assertEqual(created.json()["name"], "PT AMIGA")

        listed = self.client.get("/api/v1/clients", headers=headers)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 1)

        updated = self.client.put(
            f"/api/v1/clients/{client_id}",
            headers=headers,
            json={"code": "cl-002", "name": "PT AMIGA Updated"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["code"], "CL-002")

        deactivated = self.client.delete(f"/api/v1/clients/{client_id}", headers=headers)
        self.assertEqual(deactivated.status_code, 200, deactivated.text)
        self.assertFalse(deactivated.json()["is_active"])

    def test_duplicate_client_code_or_name_is_rejected(self):
        headers = self.auth(self.token_for("admin@amiga.local"))
        self.assertEqual(
            self.client.post(
                "/api/v1/clients",
                headers=headers,
                json={"code": "CL-001", "name": "PT AMIGA"},
            ).status_code,
            201,
        )
        duplicate_code = self.client.post(
            "/api/v1/clients",
            headers=headers,
            json={"code": "cl-001", "name": "PT Lain"},
        )
        self.assertEqual(duplicate_code.status_code, 409, duplicate_code.text)
        duplicate_name = self.client.post(
            "/api/v1/clients",
            headers=headers,
            json={"code": "CL-002", "name": "pt amiga"},
        )
        self.assertEqual(duplicate_name.status_code, 409, duplicate_name.text)


if __name__ == "__main__":
    unittest.main()
