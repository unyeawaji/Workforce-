"""
Core schedule helpers shared between the schedule and shifts route modules.

Kept in app.core to avoid any route-to-route imports (which risk circular
import errors depending on the order Python resolves them).

Cross-midnight support
----------------------
Shifts can start at 16:00 and run past midnight to 03:00–05:00 the next day.
Two key concepts:

  shift_date  – the calendar date the shift *started* on (always the clock-in date).
                This is what gets stored in Shift.date.

  logical_today() – returns the shift_date for "right now". If the current UTC
                    time is before SHIFT_BOUNDARY_HOUR (default 06:00), we treat
                    it as still belonging to the *previous* calendar day's shift,
                    because a worker who clocked in at 16:00 yesterday is still
                    mid-shift at 02:00 today.

  Cross-midnight window – when work_end < work_start (e.g. start=16:00, end=03:00),
                          the window spans midnight. The end datetime is pushed to
                          the *next* calendar day for comparison purposes.
"""
from datetime import datetime, date, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.models import DaySchedule, Holiday
from app.schemas.schemas import WorkWindowStatus

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Any clock-in/out that happens before this UTC hour is treated as still
# belonging to the previous calendar day's shift.
SHIFT_BOUNDARY_HOUR = 10  # shifts starting at 16:00 can run till morning; anything before 10:00 is still yesterday's shift


def logical_today(now: datetime | None = None) -> date:
    """
    Return the 'logical' shift date for the given moment.
    Times before SHIFT_BOUNDARY_HOUR UTC are attributed to the previous day,
    so a shift started at 16:00 Mon is still 'Monday's shift' at 02:00 Tue.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    if now.hour < SHIFT_BOUNDARY_HOUR:
        return (now - timedelta(days=1)).date()
    return now.date()


def seed_default_schedule(db: Session) -> None:
    """Create a default Mon–Fri 16:00–03:00 (next day) schedule if none exists."""
    if db.query(DaySchedule).count() == 0:
        for dow in range(7):
            db.add(DaySchedule(
                day_of_week=dow,
                is_working_day=dow < 5,          # Mon–Fri working, Sat–Sun off
                work_start_hour=15, work_start_minute=0,
                work_end_hour=23,   work_end_minute=59,  # end time not enforced — worker clocks out manually
            ))
        db.commit()


def _is_cross_midnight(sched: DaySchedule) -> bool:
    """True when end time is earlier than start time — window crosses midnight."""
    end_mins = sched.work_end_hour * 60 + sched.work_end_minute
    start_mins = sched.work_start_hour * 60 + sched.work_start_minute
    return end_mins < start_mins


def _window_datetimes(sched: DaySchedule, now: datetime):
    """
    Return (start_dt, end_dt) for the work window relevant to *now*.

    For cross-midnight windows (e.g. 16:00–03:00):
      - start is today at 16:00
      - end   is tomorrow at 03:00
    For same-day windows (e.g. 09:00–17:00):
      - both are on today's calendar date
    """
    base_date = now.date()
    # If we're in the early-morning tail of a cross-midnight window,
    # start was *yesterday* at work_start_hour.
    if _is_cross_midnight(sched) and now.hour < SHIFT_BOUNDARY_HOUR:
        base_date = base_date - timedelta(days=1)

    start = now.replace(
        year=base_date.year, month=base_date.month, day=base_date.day,
        hour=sched.work_start_hour, minute=sched.work_start_minute,
        second=0, microsecond=0,
    )
    if _is_cross_midnight(sched):
        next_day = base_date + timedelta(days=1)
        end = now.replace(
            year=next_day.year, month=next_day.month, day=next_day.day,
            hour=sched.work_end_hour, minute=sched.work_end_minute,
            second=0, microsecond=0,
        )
    else:
        end = now.replace(
            year=base_date.year, month=base_date.month, day=base_date.day,
            hour=sched.work_end_hour, minute=sched.work_end_minute,
            second=0, microsecond=0,
        )
    return start, end


def get_next_window(db: Session, from_date: date):
    """Return (day_name, 'HH:MM') for the next working day after *from_date*."""
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
    today = logical_today(now)
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
            work_start_hour=15, work_start_minute=0,
            work_end_hour=3,    work_end_minute=0,
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

    # ── Clock-in window: opens at work_start, no hard close ──────────────
    # End time is not enforced — workers clock out manually with a screenshot.
    # The only gate is whether the window has opened yet for today's shift.
    base_date = logical_today(now)
    start = now.replace(
        year=base_date.year, month=base_date.month, day=base_date.day,
        hour=sched.work_start_hour, minute=sched.work_start_minute,
        second=0, microsecond=0,
    )
    # For early-morning hours (before SHIFT_BOUNDARY_HOUR), the window already
    # opened yesterday at work_start — so clock-in is always open at that point.
    # We only block if now is on the same calendar day and before start.
    before_start = (now.date() == base_date) and (now < start)

    if before_start:
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
