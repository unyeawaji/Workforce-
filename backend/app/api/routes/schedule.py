import logging
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import DaySchedule, Holiday
from app.schemas.schemas import (
    DayScheduleOut, DayScheduleUpdate,
    HolidayCreate, HolidayOut, WorkWindowStatus,
)
from app.api.deps import require_regular_admin, require_regular_admin, get_current_user
from app.core.schedule_utils import (
    DAY_NAMES,
    get_work_window_status,
    seed_default_schedule,
)

router = APIRouter(prefix="/schedule", tags=["Schedule"])
logger = logging.getLogger(__name__)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/window", response_model=WorkWindowStatus)
def get_work_window(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Workers poll this to know if they can clock in and get countdown info."""
    return get_work_window_status(db, datetime.now(timezone.utc))


@router.get("/days", response_model=List[DayScheduleOut])
def get_day_schedules(db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    seed_default_schedule(db)
    return [DayScheduleOut.model_validate(s)
            for s in db.query(DaySchedule).order_by(DaySchedule.day_of_week).all()]


@router.put("/days/{day_of_week}", response_model=DayScheduleOut)
def update_day_schedule(
    day_of_week: int,
    payload: DayScheduleUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    if not 0 <= day_of_week <= 6:
        raise HTTPException(400, "day_of_week must be 0 (Mon) to 6 (Sun)")
    # Cross-midnight schedules (e.g. 16:00–03:00) are valid — no end>start check
    seed_default_schedule(db)
    sched = db.query(DaySchedule).filter(DaySchedule.day_of_week == day_of_week).first()
    if not sched:
        # Shouldn't happen via the API alone (seeding is all-or-nothing), but guards
        # against a partially-seeded table from direct DB access.
        raise HTTPException(404, f"No schedule row found for day {day_of_week}")
    for k, v in payload.model_dump().items():
        setattr(sched, k, v)
    db.commit()
    db.refresh(sched)
    logger.info("Admin updated schedule for %s", DAY_NAMES[day_of_week])
    return DayScheduleOut.model_validate(sched)


@router.get("/holidays", response_model=List[HolidayOut])
def list_holidays(db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    return [HolidayOut.model_validate(h)
            for h in db.query(Holiday).order_by(Holiday.date).all()]


@router.post("/holidays", response_model=HolidayOut)
def add_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    if db.query(Holiday).filter(Holiday.date == payload.date).first():
        raise HTTPException(400, "A holiday already exists for this date")
    h = Holiday(date=payload.date, name=payload.name)
    db.add(h)
    db.commit()
    db.refresh(h)
    logger.info("Admin added holiday: %s on %s", payload.name, payload.date)
    return HolidayOut.model_validate(h)


@router.delete("/holidays/{holiday_id}")
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    h = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not h:
        raise HTTPException(404, "Holiday not found")
    db.delete(h)
    db.commit()
    return {"deleted": holiday_id}
