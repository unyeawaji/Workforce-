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
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)
_scheduler: Optional[AsyncIOScheduler] = None  # Optional syntax for Python 3.9 compat


def _window_key(shift_id: int, next_due: datetime) -> str:
    """Unique key for one check-in due window — resets once worker submits."""
    return f"{shift_id}:{next_due.strftime('%Y%m%dT%H%M')}"


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


def _run_reminder():
    """Synchronous job body — imported lazily to avoid circular imports at startup."""
    from app.db.database import SessionLocal
    from app.models.models import Shift, CheckIn, WorkSchedule, PushSubscription
    from app.core.push import send_push
    from sqlalchemy.orm import joinedload

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        today = now.date()

        # Prune old log rows once per run
        _cleanup_old_logs(db)

        # Get the check-in interval setting
        schedule = db.query(WorkSchedule).filter(WorkSchedule.id == 1).first()
        interval_minutes = schedule.checkin_interval_minutes if schedule else 120

        # All open shifts today (clocked in, not clocked out)
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

        for shift in open_shifts:
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

            # Throttle — only send one notification per due window, survive restarts
            wk = _window_key(shift.id, next_due)
            if _already_notified(db, shift.id, wk):
                continue
            _mark_notified(db, shift.id, wk)

            overdue = minutes_until_due < 0
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

            # Get all push subscriptions for this worker
            subs = (
                db.query(PushSubscription)
                .filter(PushSubscription.worker_id == shift.worker_id)
                .all()
            )

            stale_ids = []
            for sub in subs:
                result = send_push(
                    endpoint=sub.endpoint,
                    p256dh=sub.p256dh,
                    auth_key=sub.auth,
                    title=title,
                    body=body,
                    url="/",
                )
                if result is None:
                    # Browser rejected the subscription — mark for removal
                    stale_ids.append(sub.id)

            # Clean up stale subscriptions
            if stale_ids:
                db.query(PushSubscription).filter(
                    PushSubscription.id.in_(stale_ids)
                ).delete(synchronize_session=False)
                db.commit()
                logger.info("Removed %d stale push subscriptions", len(stale_ids))

    except Exception as e:
        logger.error("checkin_reminder job error: %s", e)
    finally:
        db.close()


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone="UTC")
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
