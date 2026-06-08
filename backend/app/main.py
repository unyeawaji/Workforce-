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
from app.api.routes import auth, users, activities, shifts, analytics, payroll, schedule, push
from app.core.scheduler import start_scheduler, stop_scheduler

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


def run_migrations():
    """
    Safe incremental migrations.
    create_all() only creates missing *tables*, not missing *columns*.
    This function adds any columns that exist in the models but are absent
    from the live DB (e.g. after a model update on an existing Supabase DB).
    Using ADD COLUMN IF NOT EXISTS means this is idempotent and safe to
    run on every startup — no-op if the column already exists.
    """
    from sqlalchemy import text
    migrations = [
        # Shift table additions
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS screenshot_url VARCHAR(500)",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS client_name VARCHAR(200)",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS block_reason VARCHAR(255)",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS minutes_late INTEGER",
        # CheckIn table additions
        "ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS is_missed BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS note TEXT",
        # Activity table additions
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ",
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS admin_feedback TEXT",
        # User table additions
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS client_name VARCHAR(200)",
        # WorkSchedule clock-in deadline default update (16:00)
        "UPDATE work_schedule SET clock_in_deadline_hour = 15 WHERE clock_in_deadline_hour IN (9, 16)",
        # Update existing day_schedule rows to 16:00 start if still on old 9:00 default
        "UPDATE day_schedule SET work_start_hour = 15, work_start_minute = 0 WHERE work_start_hour IN (9, 16)",
        "UPDATE day_schedule SET work_end_hour = 23, work_end_minute = 59 WHERE work_end_hour = 17",
        # WorkSchedule additions
        "ALTER TABLE work_schedule ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 15",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
            except Exception as e:
                logger.warning("Migration skipped (%s): %s", stmt[:60], e)
        conn.commit()
    logger.info("Startup migrations complete.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up...")
    Base.metadata.create_all(bind=engine)
    run_migrations()
    seed_admin()
    start_scheduler()          # ← start push reminder scheduler
    yield
    stop_scheduler()           # ← clean shutdown
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

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
app.include_router(push.router, prefix=PREFIX)     # ← push subscription routes


@app.get("/health")
def health():
    return {"status": "ok", "version": settings.APP_VERSION}
