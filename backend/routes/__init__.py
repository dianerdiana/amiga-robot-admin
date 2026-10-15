from routes.auth import router as auth_router
from routes.clients import router as clients_router
from routes.users import router as users_router

__all__ = ["auth_router", "clients_router", "users_router"]
