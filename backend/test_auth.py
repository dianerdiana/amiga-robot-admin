from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from database import engine
from main import app
from scripts.seed_dev import seed_users

client = TestClient(app)


def seed_test_users():
    """Seed akun contoh untuk pengujian autentikasi & role middleware."""
    # Development users are defined once in scripts/seed_dev.py.
    with Session(engine) as session:
        seed_users(session, verbose=False)
        session.commit()
    print(" [OK] Seed user berhasil disiapkan.")


def run_tests():
    seed_test_users()

    print("\n--- 1. Uji Login Sukses & Gagal ---")
    # Login Sukses
    res_login = client.post(
        "/auth/login",
        json={"email": "intake@amiga.com", "password": "Password123!"},
    )
    assert res_login.status_code == 200, f"Login gagal: {res_login.text}"
    tokens = res_login.json()
    intake_access_token = tokens["access_token"]
    intake_refresh_token = tokens["refresh_token"]
    print(" [OK] Login Intake berhasil. Access token & refresh token diterima.")

    # Login Password Salah
    res_wrong = client.post(
        "/auth/login",
        json={"email": "intake@amiga.com", "password": "WrongPassword!"},
    )
    assert res_wrong.status_code == 401, f"Seharusnya 401: {res_wrong.text}"
    print(" [OK] Login dengan password salah ditolak (401 Unauthorized).")

    print("\n--- 2. Uji Refresh Token ---")
    res_refresh = client.post(
        "/auth/refresh-token",
        json={"refresh_token": intake_refresh_token},
    )
    assert res_refresh.status_code == 200, f"Refresh token gagal: {res_refresh.text}"
    new_tokens = res_refresh.json()
    assert "access_token" in new_tokens
    print(" [OK] Refresh token berhasil menghasilkan access token baru.")

    print("\n--- 3. Uji Endpoint Profil /auth/me ---")
    # Tanpa Token (Harus ditolak 401)
    res_me_unauth = client.get("/auth/me")
    assert res_me_unauth.status_code == 401, f"Seharusnya 401: {res_me_unauth.text}"
    print(" [OK] Akses /auth/me tanpa token ditolak (401 Unauthorized).")

    # Dengan Token Valid
    headers_intake = {"Authorization": f"Bearer {intake_access_token}"}
    res_me = client.get("/auth/me", headers=headers_intake)
    assert res_me.status_code == 200, f"Gagal get /auth/me: {res_me.text}"
    me_data = res_me.json()
    assert me_data["email"] == "intake@amiga.com"
    assert me_data["role"] == "INTAKE"
    print(f" [OK] /auth/me berhasil: {me_data['name']} ({me_data['role']}).")

    print("\n--- 4. Uji Role Middleware (RBAC) ---")
    # Login Reviewer & Admin untuk perbandingan
    res_rev = client.post(
        "/auth/login",
        json={"email": "reviewer@amiga.com", "password": "Password123!"},
    )
    reviewer_access_token = res_rev.json()["access_token"]
    headers_reviewer = {"Authorization": f"Bearer {reviewer_access_token}"}

    res_adm = client.post(
        "/auth/login",
        json={"email": "admin@amiga.com", "password": "Password123!"},
    )
    admin_access_token = res_adm.json()["access_token"]
    headers_admin = {"Authorization": f"Bearer {admin_access_token}"}

    # Kasus A: Intake mengakses endpoint intake -> Harus 200 OK
    res_role1 = client.get("/auth/test-role/intake", headers=headers_intake)
    assert res_role1.status_code == 200
    print(" [OK] INTAKE mengakses endpoint INTAKE: DIIZINKAN (200 OK).")

    # Kasus B: Intake mencoba mengakses endpoint finance-reviewer -> Harus 403 Forbidden!
    res_role2 = client.get("/auth/test-role/finance-reviewer", headers=headers_intake)
    assert res_role2.status_code == 403
    print(" [OK] INTAKE mengakses endpoint FINANCE_REVIEWER: DITOLAK (403 Forbidden).")

    # Kasus C: Reviewer mengakses endpoint finance-reviewer -> Harus 200 OK
    res_role3 = client.get("/auth/test-role/finance-reviewer", headers=headers_reviewer)
    assert res_role3.status_code == 200
    print(" [OK] FINANCE_REVIEWER mengakses endpoint FINANCE_REVIEWER: DIIZINKAN (200 OK).")

    # Kasus D: Reviewer mencoba mengakses endpoint admin -> Harus 403 Forbidden!
    res_role4 = client.get("/auth/test-role/admin-only", headers=headers_reviewer)
    assert res_role4.status_code == 403
    print(" [OK] FINANCE_REVIEWER mengakses endpoint ADMIN: DITOLAK (403 Forbidden).")

    # Kasus E: Admin mengakses endpoint admin-only -> Harus 200 OK
    res_role5 = client.get("/auth/test-role/admin-only", headers=headers_admin)
    assert res_role5.status_code == 200
    print(" [OK] SYSTEM_ADMIN mengakses endpoint ADMIN: DIIZINKAN (200 OK).")

    # Kasus F: Multi-role endpoint (SERVICE_LEAD atau SYSTEM_ADMIN)
    res_multi_admin = client.get("/auth/test-role/lead-or-admin", headers=headers_admin)
    assert res_multi_admin.status_code == 200
    print(" [OK] SYSTEM_ADMIN mengakses endpoint multi-role: DIIZINKAN (200 OK).")

    res_multi_intake = client.get("/auth/test-role/lead-or-admin", headers=headers_intake)
    assert res_multi_intake.status_code == 403
    print(" [OK] INTAKE mengakses endpoint multi-role (Lead/Admin): DITOLAK (403 Forbidden).")

    print("\n SEMUA PENGUJIAN OTENTIKASI & ROLE MIDDLEWARE BERHASIL 100%!")


if __name__ == "__main__":
    run_tests()
