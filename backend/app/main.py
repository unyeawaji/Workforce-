import logging
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
from app.api.routes import applications, clients, invites, sys as sys_routes
from app.api.routes import applications, clients, invites
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
            admin_email = settings.ADMIN_EMAIL
            admin_password = settings.ADMIN_PASSWORD
            if not admin_password:
                logger.error("ADMIN_PASSWORD env var not set — no default admin created.")
                return
            db.add(User(
                name="System Admin",
                email=admin_email,
                password_hash=get_password_hash(admin_password),
                role=UserRole.admin,
                department="Administration",
                is_system_admin=True,
            ))
            db.commit()
            logger.info("Default admin created: %s", admin_email)
    finally:
        db.close()


def run_migrations():
    from sqlalchemy import text
    migrations = [
        # Shift table
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS screenshot_url VARCHAR(500)",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS client_name VARCHAR(200)",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS block_reason VARCHAR(255)",
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS minutes_late INTEGER",
        # CheckIn table
        "ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS is_missed BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS note TEXT",
        # Activity table
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ",
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS admin_feedback TEXT",
        # User table
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS client_name VARCHAR(200)",
        # NEW: admin_id siloing column on users
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
        # WorkSchedule
        "ALTER TABLE work_schedule ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 15",
        # NEW: single admin-wide currency setting — supersedes the old per-department currency
        "ALTER TABLE work_schedule ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD' NOT NULL",
        # One-time backfill: if any department previously had a non-USD currency set,
        # carry that into the new global setting instead of silently resetting to USD.
        # No-ops harmlessly once work_schedule.currency has already been customized.
        """
        UPDATE work_schedule
        SET currency = sub.currency
        FROM (
            SELECT currency FROM department_rates
            WHERE currency IS NOT NULL AND currency <> 'USD'
            ORDER BY updated_at DESC LIMIT 1
        ) sub
        WHERE work_schedule.id = 1 AND work_schedule.currency = 'USD'
        """,
        "UPDATE work_schedule SET clock_in_deadline_hour = 15 WHERE clock_in_deadline_hour IN (9, 16)",
        # day_schedules (correct table name)
        "UPDATE day_schedules SET work_start_hour = 15, work_start_minute = 0 WHERE work_start_hour IN (9, 16)",
        "UPDATE day_schedules SET work_end_hour = 23, work_end_minute = 59 WHERE work_end_hour = 17",
        # NEW: job_applications and client_workers created by create_all — migrations for any missing cols only
        "ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
        "ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS cover_letter TEXT",
        "ALTER TABLE admin_invites ADD COLUMN IF NOT EXISTS email_hint VARCHAR(255)",
        # NEW: worker's own explanation for a late/blocked/missed shift
        "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS worker_note TEXT",
        # NEW: track whether/when a client revised their review
        "ALTER TABLE worker_reviews ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ",
        # NEW: offboarding audit trail
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_reason VARCHAR(500)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ",
        # System admin flag — only the seeded super-admin; cannot own workers/clients
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system_admin BOOLEAN NOT NULL DEFAULT FALSE",
        # Position type applicants select (tasker | onboarding_assessment)
        "ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS position_type VARCHAR(60) NOT NULL DEFAULT 'tasker'",
        # Services an admin's team offers — stored as comma-separated string, e.g. "account_recovery,assessment"
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS services TEXT",
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text("SAVEPOINT mig"))
                conn.execute(text(stmt))
                conn.execute(text("RELEASE SAVEPOINT mig"))
            except Exception as e:
                conn.execute(text("ROLLBACK TO SAVEPOINT mig"))
                logger.warning("Migration skipped (%s): %s", stmt[:60], e)
        conn.commit()
    logger.info("Startup migrations complete.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up...")
    Base.metadata.create_all(bind=engine)
    run_migrations()
    seed_admin()
    start_scheduler()
    yield
    stop_scheduler()
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
app.include_router(push.router, prefix=PREFIX)
app.include_router(applications.router, prefix=PREFIX)
app.include_router(clients.router, prefix=PREFIX)
app.include_router(invites.router, prefix=PREFIX)
app.include_router(sys_routes.router, prefix=PREFIX)


@app.get("/health")
def health():
    return {"status": "ok", "version": settings.APP_VERSION}
