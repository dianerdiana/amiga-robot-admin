#!/bin/sh
set -eu

# Fail fast with the full list of configuration problems before touching the database.
python -c "import core.config"

# Schema + AMIGA Robot system user. Idempotent.
alembic upgrade head

exec "$@"
