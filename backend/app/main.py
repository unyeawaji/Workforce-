import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import get_password_hash
from app.db.database import engine, Base, SessionLocal
from app.api.routes import auth, users, activities, shifts, analytics, payroll, schedule, push
from app.api.routes import applications, clients, invites, sys as sys_routes
from app.core.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


def seed_admin():
    """
    Upsert the system admin account from env vars on every startup.
    This ensures Railway env var changes (email/password) take effect
    on the next deploy without needing to touch the DB manually.
    """
    from app.models.models import User, UserRole
    admin_email = settings.ADMIN_EMAIL
    admin_password = settings.ADMIN_PASSWORD

    if not admin_password:
        logger.error("ADMIN_PASSWORD env var not set — system admin not created/updated.")
        return

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == admin_email).first()
        if existing:
            # Always sync the password from env — so Railway env var changes apply on redeploy
            existing.password_hash = get_password_hash(admin_password)
            existing.is_system_admin = True
            existing.is_active = True
            db.commit()
            logger.info("System admin credentials synced from env: %s", admin_email)
        else:
            db.add(User(
                name="System Admin",
                email=admin_email,
                password_hash=get_password_hash(admin_password),
                role=UserRole.admin,
                department="Administration",
                is_system_admin=True,
            ))
            db.commit()
            logger.info("System admin created: %s", admin_email)
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

        # ── Per-admin work schedules (was previously one global singleton) ──
        # Add admin_id columns. Existing rows (created before this migration)
        # will have admin_id = NULL until backfilled below.
        "ALTER TABLE work_schedule ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE",
        "ALTER TABLE day_schedules ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE",
        "ALTER TABLE holidays ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE",

        # The original singleton row was created with an explicit `id=1`
        # (WorkSchedule(id=1)) rather than letting Postgres generate it via
        # the sequence — so work_schedule_id_seq was very likely never
        # advanced past its starting value. Re-sync it from the actual max
        # id in the table before we insert any new per-admin rows below;
        # otherwise the next INSERT could try to reuse id=1 and collide,
        # or worse, hand out duplicate ids across the backfill inserts.
        # setval(..., true) means "next nextval() returns max+1" — false
        # would mean "next nextval() returns max itself", which we don't want.
        """
        SELECT setval(
            pg_get_serial_sequence('work_schedule', 'id'),
            COALESCE((SELECT MAX(id) FROM work_schedule), 1),
            true
        )
        """,

        # Drop the old global-uniqueness constraints so multiple admins can
        # each have a day_of_week=0 row / a holiday on the same date.
        "ALTER TABLE day_schedules DROP CONSTRAINT IF EXISTS day_schedules_day_of_week_key",
        "ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_date_key",

        # Backfill: clone the old global settings (id=1 / admin_id IS NULL rows)
        # into a fresh row for every existing admin who doesn't have one yet.
        # This runs once — once an admin has a row, ON CONFLICT-style guards
        # (the admin_id IS NULL filters below) make it a no-op on later restarts.
        """
        INSERT INTO work_schedule
            (admin_id, clock_in_deadline_hour, clock_in_deadline_minute,
             checkin_interval_minutes, grace_period_minutes, currency)
        SELECT u.id, g.clock_in_deadline_hour, g.clock_in_deadline_minute,
               g.checkin_interval_minutes, g.grace_period_minutes, g.currency
        FROM users u
        CROSS JOIN (
            SELECT * FROM work_schedule WHERE admin_id IS NULL ORDER BY id LIMIT 1
        ) g
        WHERE u.role = 'admin' AND u.is_system_admin = FALSE
          AND NOT EXISTS (SELECT 1 FROM work_schedule ws WHERE ws.admin_id = u.id)
        """,
        """
        INSERT INTO day_schedules
            (admin_id, day_of_week, is_working_day,
             work_start_hour, work_start_minute, work_end_hour, work_end_minute)
        SELECT u.id, g.day_of_week, g.is_working_day,
               g.work_start_hour, g.work_start_minute, g.work_end_hour, g.work_end_minute
        FROM users u
        CROSS JOIN (
            SELECT * FROM day_schedules WHERE admin_id IS NULL
        ) g
        WHERE u.role = 'admin' AND u.is_system_admin = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM day_schedules ds
              WHERE ds.admin_id = u.id AND ds.day_of_week = g.day_of_week
          )
        """,
        # Holidays: clone any pre-existing global holidays to every admin too,
        # so nobody loses dates they'd already configured.
        """
        INSERT INTO holidays (admin_id, date, name)
        SELECT u.id, g.date, g.name
        FROM users u
        CROSS JOIN (
            SELECT * FROM holidays WHERE admin_id IS NULL
        ) g
        WHERE u.role = 'admin' AND u.is_system_admin = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM holidays h WHERE h.admin_id = u.id AND h.date = g.date
          )
        """,
        # The old global rows (admin_id IS NULL) are now superseded by the
        # per-admin clones above — remove them so they don't show up as an
        # orphaned "no admin" schedule that nothing queries against anymore.
        "DELETE FROM work_schedule WHERE admin_id IS NULL",
        "DELETE FROM day_schedules WHERE admin_id IS NULL",
        "DELETE FROM holidays WHERE admin_id IS NULL",
        # Re-add uniqueness, now scoped per admin instead of globally.
        "ALTER TABLE work_schedule ADD CONSTRAINT uq_work_schedule_admin UNIQUE (admin_id)",
        "ALTER TABLE day_schedules ADD CONSTRAINT uq_admin_day UNIQUE (admin_id, day_of_week)",
        "ALTER TABLE holidays ADD CONSTRAINT uq_admin_holiday_date UNIQUE (admin_id, date)",
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


@app.middleware("http")
async def handle_options_preflight(request: Request, call_next):
    """
    Starlette's CORSMiddleware returns 400 for OPTIONS requests whose Origin
    isn't in ALLOWED_ORIGINS (e.g. requests with no Origin header, or from
    a browser dev tool). This middleware intercepts all OPTIONS and returns
    200 immediately so CORS preflights always succeed. Security is enforced
    by JWT on actual API calls — a 200 preflight doesn't grant any data access.

    NOTE: must be registered AFTER add_middleware(CORSMiddleware) so that
    Starlette places it as the outermost layer (last-registered = outermost).
    """
    if request.method == "OPTIONS":
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Max-Age": "600",
            },
        )
    return await call_next(request)

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
