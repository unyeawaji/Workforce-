"""
Core schedule helpers shared between the schedule and shifts route modules.

Kept in app.core to avoid any route-to-route imports (which risk circular
import errors depending on the order Python resolves them).
"""
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from app.models.models import DaySchedule, Holiday
from app.schemas.schemas import WorkWindowStatus

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def seed_default_schedule(db: Session) -> None:
    """Create a default Mon–Fri 09:00–17:00 schedule if none exists."""
    if db.query(DaySchedule).count() == 0:
        for dow in range(7):
            db.add(DaySchedule(
                day_of_week=dow,
                is_working_day=dow < 5,          # Mon–Fri working, Sat–Sun off
                work_start_hour=9,  work_start_minute=0,
                work_end_hour=17,   work_end_minute=0,
            ))
        db.commit()


def get_next_window(db: Session, from_date: date):
    """Return (day_name, 'HH:MM') for the next working day after *from_date*.

    Scans up to 7 days ahead; returns (None, None) if none found.
    """
    for i in range(1, 8):
        next_date = from_date + timedelta(days=i)
        dow = next_date.weekday()
        if db.query(Holiday).filter(Holiday.date == next_date).first():
            continue
        sched = db.query(DaySchedule).filter(DaySchedule.day_of_week == dow).first()
        if sched and sched.is_working_day:
            return DAY_NAMES[dow], f"{sched.work_start_hour:02d}:{sched.work_start_minute:02d}"
    return None, None


def get_work_window_status(db: Session, now: datetime) -> WorkWindowStatus:
    """Determine whether clock-in is currently permitted and return full window info."""
    seed_default_schedule(db)
    today = now.date()
    dow = today.weekday()  # 0=Mon, 6=Sun

    # ── Holiday check ──────────────────────────────────────────────────────
    holiday = db.query(Holiday).filter(Holiday.date == today).first()
    if holiday:
        nw_day, nw_start = get_next_window(db, today)
        return WorkWindowStatus(
            can_clock_in=False,
            is_holiday=True,
            holiday_name=holiday.name,
            is_working_day=False,
            work_start_hour=0, work_start_minute=0,
            work_end_hour=0,   work_end_minute=0,
            message=f"Today is a holiday: {holiday.name}.",
            next_window_day=nw_day,
            next_window_start=nw_start,
        )

    # ── Day schedule ───────────────────────────────────────────────────────
    sched = db.query(DaySchedule).filter(DaySchedule.day_of_week == dow).first()
    if not sched:
        sched = DaySchedule(
            day_of_week=dow, is_working_day=False,
            work_start_hour=9, work_start_minute=0,
            work_end_hour=17,  work_end_minute=0,
        )

    if not sched.is_working_day:
        nw_day, nw_start = get_next_window(db, today)
        return WorkWindowStatus(
            can_clock_in=False,
            is_holiday=False,
            is_working_day=False,
            work_start_hour=sched.work_start_hour,
            work_start_minute=sched.work_start_minute,
            work_end_hour=sched.work_end_hour,
            work_end_minute=sched.work_end_minute,
            message=f"{DAY_NAMES[dow]} is not a working day.",
            next_window_day=nw_day,
            next_window_start=nw_start,
        )

    # ── Within-day window ──────────────────────────────────────────────────
    start = now.replace(
        hour=sched.work_start_hour, minute=sched.work_start_minute,
        second=0, microsecond=0,
    )
    end = now.replace(
        hour=sched.work_end_hour, minute=sched.work_end_minute,
        second=0, microsecond=0,
    )

    if now < start:
        mins = int((start - now).total_seconds() / 60)
        return WorkWindowStatus(
            can_clock_in=False,
            is_holiday=False,
            is_working_day=True,
            work_start_hour=sched.work_start_hour,
            work_start_minute=sched.work_start_minute,
            work_end_hour=sched.work_end_hour,
            work_end_minute=sched.work_end_minute,
            message=(
                f"Work hasn't started yet. Opens at "
                f"{sched.work_start_hour:02d}:{sched.work_start_minute:02d} UTC ({mins} min)."
            ),
            next_window_day=DAY_NAMES[dow],
            next_window_start=f"{sched.work_start_hour:02d}:{sched.work_start_minute:02d}",
        )

    if now > end:
        nw_day, nw_start = get_next_window(db, today)
        return WorkWindowStatus(
            can_clock_in=False,
            is_holiday=False,
            is_working_day=True,
            work_start_hour=sched.work_start_hour,
            work_start_minute=sched.work_start_minute,
            work_end_hour=sched.work_end_hour,
            work_end_minute=sched.work_end_minute,
            message=(
                f"Work hours have ended for today "
                f"({sched.work_end_hour:02d}:{sched.work_end_minute:02d} UTC)."
            ),
            next_window_day=nw_day,
            next_window_start=nw_start,
        )

    return WorkWindowStatus(
        can_clock_in=True,
        is_holiday=False,
        is_working_day=True,
        work_start_hour=sched.work_start_hour,
        work_start_minute=sched.work_start_minute,
        work_end_hour=sched.work_end_hour,
        work_end_minute=sched.work_end_minute,
        message="Work hours are active.",
    )
