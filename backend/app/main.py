import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import get_password_hash
from app.db.database import engine, Base, SessionLocal
from app.api.routes import auth, users, activities, shifts, analytics, payroll, schedule

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


def seed_admin():
    from app.models.models import User, UserRole
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.role == UserRole.admin).first():
            admin_email = os.environ.get("ADMIN_EMAIL", "admin@aiinduction.local")
            admin_password = os.environ.get("ADMIN_PASSWORD")
            if not admin_password:
                logger.error(
                    "ADMIN_PASSWORD env var is not set. "
                    "Set it in Railway before deploying — no default admin will be created."
                )
                return
            db.add(User(
                name="System Admin",
                email=admin_email,
                password_hash=get_password_hash(admin_password),
                role=UserRole.admin,
                department="Administration",
            ))
            db.commit()
            logger.info("Default admin created: %s", admin_email)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up...")
    Base.metadata.create_all(bind=engine)
    seed_admin()
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    # Disable public API docs in production
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# Attach limiter state and its 429 handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(users.router, prefix=PREFIX)
app.include_router(shifts.router, prefix=PREFIX)
app.include_router(activities.router, prefix=PREFIX)
app.include_router(analytics.router, prefix=PREFIX)
app.include_router(payroll.router, prefix=PREFIX)
app.include_router(schedule.router, prefix=PREFIX)


@app.get("/health")
def health():
    return {"status": "ok", "version": settings.APP_VERSION}
