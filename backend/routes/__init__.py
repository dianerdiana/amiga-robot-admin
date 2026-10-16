from routes.auth import router as auth_router
from routes.clients import router as clients_router
from routes.extraction import router as extraction_router
from routes.invoices import me_router, router as invoices_router
from routes.users import router as users_router
from routes.vouchers import router as vouchers_router

__all__ = [
    "auth_router",
    "clients_router",
    "extraction_router",
    "invoices_router",
    "me_router",
    "users_router",
    "vouchers_router",
]
