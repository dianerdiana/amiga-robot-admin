"""Seed all development data: login users, demo clients, and user-client assignments.

Run from the backend folder after `alembic upgrade head`. The seed also restores
the non-login AMIGA Robot system user if its row was removed:
    python -m scripts.seed_dev
    python -m scripts.seed_dev --password 'S3cret!' --skip-clients

Inside docker compose (database host "db"), --force is required as well:
    docker compose exec backend python -m scripts.seed_dev --password 'S3cret!' --force

Idempotent: existing users (and their passwords), clients, and assignments are left
untouched. There is no default password, and the script refuses to run against any
database host other than localhost unless --force is given: the compose host "db" is the
same locally and on the deployed server, so it is never assumed to be local.
"""

import argparse
import sys

from sqlalchemy import or_
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from core.config import settings
from core.security import hash_password
from database import DATABASE_URL, SessionLocal
from models.client import Client
from models.user import User, UserRole
from models.user_client import UserClient

LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1"}

DEV_USERS = [
    ("Budi Intake", "intake@amiga.com", UserRole.INTAKE),
    ("Siti Finance Reviewer", "reviewer@amiga.com", UserRole.FINANCE_REVIEWER),
    ("Admin System", "admin@amiga.com", UserRole.SYSTEM_ADMIN),
]

# The second client deliberately has no reviewer so the "Belum ada reviewer" indicator shows.
DEV_CLIENTS = [
    ("CL-RT", "Klien A - Retail Mandiri", True),
    ("CL-LG", "Klien B - Logistik Cepat", False),
]


def seed_users(db: Session, password: str = DEFAULT_PASSWORD, verbose: bool = True) -> None:
    """Create the system robot and development login users; existing users are never modified."""
    robot_email = settings.ROBOT_ADMIN_EMAIL
    if db.query(User).filter(User.email == robot_email).first():
        _log(verbose, f"[SKIP] system user {robot_email} already exists")
    else:
        db.add(
            User(
                name="AMIGA Robot",
                email=robot_email,
                password_hash=None,
                role=UserRole.ROBOT_ADMIN,
                is_active=True,
            )
        )
        _log(verbose, f"[NEW]  system user {robot_email} ({UserRole.ROBOT_ADMIN.value})")

    for name, email, role in DEV_USERS:
        if db.query(User).filter(User.email == email).first():
            _log(verbose, f"[SKIP] user {email} already exists")
            continue
        db.add(User(name=name, email=email, password_hash=hash_password(password), role=role, is_active=True))
        _log(verbose, f"[NEW]  user {email} ({role.value})")
    db.flush()


def seed_clients(
    db: Session,
    intake_email: str = "intake@amiga.com",
    reviewer_email: str = "reviewer@amiga.com",
    verbose: bool = True,
) -> None:
    """Create demo clients and assign the Intake user (all) and the reviewer (first client only)."""
    intake = db.query(User).filter(User.email == intake_email, User.role == UserRole.INTAKE).first()
    reviewer = db.query(User).filter(User.email == reviewer_email, User.role == UserRole.FINANCE_REVIEWER).first()
    if intake is None:
        raise SystemExit(f"[FAIL] INTAKE user {intake_email} not found; run without --skip-users first.")

    for code, name, with_reviewer in DEV_CLIENTS:
        # Code and name are both unique, so an existing client may match on either.
        client = db.query(Client).filter(or_(Client.code == code, Client.name == name)).first()
        if client is None:
            client = Client(code=code, name=name)
            db.add(client)
            db.flush()
            _log(verbose, f"[NEW]  client {code} - {name}")
        else:
            _log(verbose, f"[SKIP] client {client.code} - {client.name} already exists")
        code = client.code

        members = [intake] + ([reviewer] if with_reviewer and reviewer is not None else [])
        for user in members:
            if db.get(UserClient, (user.id, client.id)) is None:
                db.add(UserClient(user_id=user.id, client_id=client.id))
                _log(verbose, f"[NEW]  {user.email} -> {code}")
            else:
                _log(verbose, f"[SKIP] {user.email} -> {code} already assigned")
    db.flush()


def _log(verbose: bool, message: str) -> None:
    if verbose:
        print(message)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed development users, demo clients, and assignments.")
    parser.add_argument("--password", required=True, help="Password for newly created users.")
    parser.add_argument("--skip-clients", action="store_true", help="Seed login users only.")
    parser.add_argument("--force", action="store_true", help="Allow seeding a non-local database.")
    args = parser.parse_args()

    url = make_url(DATABASE_URL)
    if url.host not in LOCAL_DB_HOSTS and not args.force:
        print(f"[FAIL] Refusing to seed non-local database host '{url.host}'. Use --force if this is intended.")
        return 1
    print(f"Seeding {url.render_as_string(hide_password=True)}")

    with SessionLocal() as db:
        seed_users(db, args.password)
        if not args.skip_clients:
            seed_clients(db)
        db.commit()

    print("\nDone. Login accounts:", ", ".join(email for _, email, _ in DEV_USERS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
