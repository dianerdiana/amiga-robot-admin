import sys
sys.path.insert(0, ".")
from fastapi.testclient import TestClient
from main import app

c = TestClient(app)
r = c.post("/api/v1/auth/login", json={"email":"reviewer@amiga.com","password":"Password123!"})
h = {"Authorization": f"Bearer {r.json()['access_token']}"}
sid = c.post("/api/v1/chat/sessions", json={"title":"Probe10"}, headers=h).json()["id"]
for text in ["1 + 1 berapa ya?", "2 * 3", "10 - 4", "1/2", "apa itu AMIGA?"]:
    resp = c.post(f"/api/v1/chat/sessions/{sid}/messages", json={"content": text}, headers=h)
    print(text, "->", resp.status_code, "|", resp.json().get("answer", resp.text))
PY