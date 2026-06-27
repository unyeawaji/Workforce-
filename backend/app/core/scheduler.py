"""
Background scheduler — runs inside the FastAPI process using APScheduler.

Jobs:
  checkin_reminder  — every 2 minutes: finds all workers currently on shift
                      whose check-in is overdue or due within 5 minutes,
                      and sends them a Web Push notification.

Throttle durability note:
  The _notified set is backed by the DB (PushNotificationLog) so that
  redeploys / process restarts do not cause duplicate notifications within
  the same check-in due window.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)
_scheduler: Optional[BackgroundScheduler] = None  # Optional syntax for Python 3.9 compat


def _window_key(shift_id: int, next_due: datetime, kind: str) -> str:
    """
    Unique key for one check-in notification — resets once worker submits.

    `kind` distinguishes the "5 minutes left" warning from the "now overdue"
    escalation. These must be separate keys: both share the same `next_due`
    timestamp (it doesn't change just because time passed it), so without
    `kind` the warning's throttle record would silently suppress the overdue
    escalation too — meaning a worker who got the early warning would never
    receive the overdue alert, even if they went significantly overdue.
    """
    return f"{shift_id}:{next_due.strftime('%Y%m%dT%H%M')}:{kind}"


def _already_notified(db, shift_id: int, window_key: str) -> bool:
    """Check DB log to see if this window was already notified."""
    from app.models.models import PushNotificationLog
    return db.query(PushNotificationLog).filter(
        PushNotificationLog.shift_id == shift_id,
        PushNotificationLog.window_key == window_key,
    ).first() is not None


def _mark_notified(db, shift_id: int, window_key: str) -> None:
    """Persist notification record so restarts don't re-notify."""
    from app.models.models import PushNotificationLog
    db.add(PushNotificationLog(shift_id=shift_id, window_key=window_key))
    db.commit()


def _cleanup_old_logs(db) -> None:
    """Prune log rows older than 24h to keep the table small."""
    from app.models.models import PushNotificationLog
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    db.query(PushNotificationLog).filter(
        PushNotificationLog.notified_at < cutoff
    ).delete(synchronize_session=False)
    db.commit()


def _cleanup_old_export_tokens(db) -> None:
    """
    Prune used export-token records once they're well past expiry.

    Tokens have a 60s TTL (see create_export_token), so anything older than a
    few minutes can never be replayed again — this just keeps the table from
    growing forever. Runs here (every 2 min) instead of inline in the /export
    request path, so a read-only export call never pays for a DELETE.
    """
    from app.models.models import UsedExportToken
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.query(UsedExportToken).filter(
        UsedExportToken.used_at < cutoff
    ).delete(synchronize_session=False)
    db.commit()


def _run_reminder():
    """Synchronous job body — imported lazily to avoid circular imports at startup."""
    from app.db.database import SessionLocal
    from app.models.models import Shift, CheckIn
    from app.core.push import notify_user
    from app.core.schedule_utils import get_or_create_work_schedule, logical_today
    from sqlalchemy.orm import joinedload

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        today = logical_today(now)

        # Prune old log rows once per run
        _cleanup_old_logs(db)
        _cleanup_old_export_tokens(db)

        # All open shifts today (clocked in, not clocked out), across every
        # admin's team — this job is global, so it has to fan out per-admin
        # rather than reading one platform-wide schedule.
        open_shifts = (
            db.query(Shift)
            .options(joinedload(Shift.check_ins), joinedload(Shift.worker))
            .filter(
                Shift.date == today,
                Shift.clock_in.isnot(None),
                Shift.clock_out.is_(None),
            )
            .all()
        )

        # Cache each admin's check-in interval so we don't re-fetch/create
        # the WorkSchedule row once per shift when several workers share an admin.
        interval_by_admin: dict[int, int] = {}

        for shift in open_shifts:
            admin_id = shift.worker.admin_id if shift.worker else None
            if admin_id is None:
                # Orphaned shift with no resolvable admin team — nothing to
                # check against, skip rather than guessing a schedule.
                continue

            if admin_id not in interval_by_admin:
                schedule = get_or_create_work_schedule(db, admin_id)
                interval_by_admin[admin_id] = schedule.checkin_interval_minutes if schedule else 120
            interval_minutes = interval_by_admin[admin_id]

            # Sort check_ins by submitted_at so [-1] is genuinely the latest
            sorted_checkins = sorted(shift.check_ins, key=lambda c: c.submitted_at)
            last_event = (
                sorted_checkins[-1].submitted_at
                if sorted_checkins
                else shift.clock_in
            )
            next_due = last_event + timedelta(minutes=interval_minutes)
            minutes_until_due = (next_due - now).total_seconds() / 60

            # Notify if: overdue (< 0) OR due within the next 5 minutes
            should_notify = minutes_until_due <= 5

            if not should_notify:
                continue

            overdue = minutes_until_due < 0
            kind = "overdue" if overdue else "warning"

            # Throttle — only send one notification per (window, kind), survive restarts
            wk = _window_key(shift.id, next_due, kind)
            if _already_notified(db, shift.id, wk):
                continue
            _mark_notified(db, shift.id, wk)

            if overdue:
                title = "⛔ Check-in overdue!"
                body = (
                    f"Your Outlier check-in is {int(abs(minutes_until_due))} min overdue. "
                    "Your shift is now blocked — submit now."
                )
            else:
                title = "🔔 Check-in due in 5 minutes"
                body = (
                    "Time to submit your Outlier check-in. "
                    "Take a screenshot of your dashboard and report your task count."
                )

            notify_user(db, shift.worker_id, title=title, body=body)

    except Exception as e:
        logger.error("checkin_reminder job error: %s", e)
    finally:
        db.close()


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    # Run every 2 minutes — fine granularity without hammering the DB
    _scheduler.add_job(_run_reminder, "interval", minutes=2, id="checkin_reminder",
                       max_instances=1, coalesce=True)
    _scheduler.start()
    logger.info("Background scheduler started (checkin_reminder every 2 min)")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Background scheduler stopped")
