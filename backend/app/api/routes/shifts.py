import logging
from datetime import datetime, date, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session, joinedload
from app.db.database import get_db
from app.models.models import Shift, CheckIn, User, UserRole, WorkSchedule
from app.schemas.schemas import ShiftOut, ShiftOutFull, CheckInOut, WorkScheduleOut, WorkScheduleUpdate
from app.api.deps import get_current_user, require_admin
from app.core.cloudinary_config import upload_screenshot as cloudinary_upload
from app.core.schedule_utils import get_work_window_status

router = APIRouter(prefix="/shifts", tags=["Shifts"])
logger = logging.getLogger(__name__)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
MAX_TASKS_PER_CHECKIN = 500        # FIX: cap on outlier_tasks_completed


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _get_schedule(db: Session) -> WorkSchedule:
    s = db.query(WorkSchedule).filter(WorkSchedule.id == 1).first()
    if not s:
        s = WorkSchedule(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _check_punctuality(shift: Shift, schedule: WorkSchedule, now: datetime):
    """Flag shift as late or blocked based on schedule."""
    deadline = now.replace(
        hour=schedule.clock_in_deadline_hour,
        minute=schedule.clock_in_deadline_minute,
        second=0, microsecond=0,
    )
    grace_end = deadline + timedelta(minutes=schedule.grace_period_minutes)
    diff_minutes = int((now - deadline).total_seconds() / 60)

    if now > grace_end:
        shift.is_late = True
        shift.is_blocked = True
        shift.minutes_late = diff_minutes
        shift.block_reason = (
            f"Clocked in {diff_minutes} minutes late "
            f"(deadline was {schedule.clock_in_deadline_hour:02d}:{schedule.clock_in_deadline_minute:02d} UTC, "
            f"grace period {schedule.grace_period_minutes} min)."
        )
    elif now > deadline:
        shift.is_late = True
        shift.minutes_late = diff_minutes


def _next_checkin_due(shift: Shift, schedule: WorkSchedule) -> Optional[datetime]:
    """Return when the next check-in is due, or None if not yet needed."""
    if not shift.clock_in:
        return None
    # BUG FIX: sort before indexing — ORM relationship has no guaranteed order_by.
    # The scheduler already does this; apply the same guard here.
    sorted_checkins = sorted(shift.check_ins, key=lambda c: c.submitted_at)
    last = sorted_checkins[-1].submitted_at if sorted_checkins else shift.clock_in
    return last + timedelta(minutes=schedule.checkin_interval_minutes)


def _has_missed_checkin(shift: Shift, schedule: WorkSchedule, now: datetime) -> bool:
    if not shift.clock_in or shift.clock_out:
        return False
    due = _next_checkin_due(shift, schedule)
    return due is not None and now > due


# ── Work Schedule (admin) ──────────────────────────────────────────────────────

@router.get("/schedule", response_model=WorkScheduleOut)
def get_schedule(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return WorkScheduleOut.model_validate(_get_schedule(db))


@router.patch("/schedule", response_model=WorkScheduleOut)
def update_schedule(payload: WorkScheduleUpdate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    s = _get_schedule(db)
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    logger.info("Admin updated work schedule")
    return WorkScheduleOut.model_validate(s)


# ── Clock In ──────────────────────────────────────────────────────────────────

@router.post("/clock-in", response_model=ShiftOut)
def clock_in(client_name: Optional[str] = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = _today()
    shift = db.query(Shift).filter(Shift.worker_id == user.id, Shift.date == t).first()
    if shift and shift.clock_in:
        raise HTTPException(409, "Already clocked in today")
    now = datetime.now(timezone.utc)
    if not shift:
        shift = Shift(worker_id=user.id, date=t)
        db.add(shift)
    # Enforce work window
    window = get_work_window_status(db, now)
    if not window.can_clock_in:
        db.rollback()
        raise HTTPException(403, window.message)

    shift.clock_in = now
    if client_name:
        shift.client_name = client_name.strip()
    schedule = _get_schedule(db)
    _check_punctuality(shift, schedule, now)
    db.commit()
    db.refresh(shift)
    if shift.is_blocked:
        logger.warning("Worker %s blocked for late clock-in: %s", user.id, shift.block_reason)
    else:
        logger.info("Worker %s clocked in%s", user.id, '  (LATE)' if shift.is_late else '')
    return ShiftOut.model_validate(shift)


# ── Periodic Check-In ─────────────────────────────────────────────────────────

@router.post("/check-in", response_model=CheckInOut)
async def submit_checkin(
    outlier_tasks_completed: int = Form(...),
    note: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    t = _today()
    shift = (
        db.query(Shift)
        .options(joinedload(Shift.check_ins))
        .filter(Shift.worker_id == user.id, Shift.date == t)
        .first()
    )
    if not shift or not shift.clock_in:
        raise HTTPException(400, "You must be clocked in to submit a check-in")
    if shift.clock_out:
        raise HTTPException(400, "Shift already ended")
    if shift.is_blocked:
        raise HTTPException(403, f"Your shift is blocked: {shift.block_reason}")
    if outlier_tasks_completed < 0:
        raise HTTPException(400, "Task count cannot be negative")
    # FIX: cap on outlier_tasks_completed to prevent inflation
    if outlier_tasks_completed > MAX_TASKS_PER_CHECKIN:
        raise HTTPException(400, f"Task count cannot exceed {MAX_TASKS_PER_CHECKIN} per check-in")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, or WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(400, "Screenshot must be under 5MB")

    try:
        seq = len(shift.check_ins) + 1
        url = cloudinary_upload(contents, user.id, shift.id, prefix=f"checkin_{seq}")
    except Exception as e:
        logger.error("Cloudinary check-in upload failed: %s", e)
        raise HTTPException(500, "Failed to upload screenshot. Please try again.")

    checkin = CheckIn(
        shift_id=shift.id,
        worker_id=user.id,
        screenshot_url=url,
        outlier_tasks_completed=outlier_tasks_completed,
        note=note,
    )
    db.add(checkin)
    # If shift was blocked for missed check-in, unblock it now
    if shift.is_blocked and shift.block_reason and "check-in" in shift.block_reason.lower():
        shift.is_blocked = False
        shift.block_reason = None
    db.commit()
    db.refresh(checkin)
    logger.info("Worker %s submitted check-in #%s with %s tasks", user.id, len(shift.check_ins), outlier_tasks_completed)
    return CheckInOut.model_validate(checkin)


@router.get("/check-ins/status")
def checkin_status(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Returns whether a check-in is due and when the next one is."""
    t = _today()
    shift = (
        db.query(Shift)
        .options(joinedload(Shift.check_ins))
        .filter(Shift.worker_id == user.id, Shift.date == t)
        .first()
    )
    if not shift or not shift.clock_in or shift.clock_out:
        return {"due": False, "next_due_at": None, "overdue": False, "check_in_count": 0}

    schedule = _get_schedule(db)
    now = datetime.now(timezone.utc)
    next_due = _next_checkin_due(shift, schedule)
    overdue = _has_missed_checkin(shift, schedule, now)

    # Block shift if check-in is overdue
    if overdue and not shift.is_blocked:
        shift.is_blocked = True
        shift.block_reason = "Missed periodic check-in. Submit a check-in to continue."
        db.commit()

    return {
        "due": next_due is not None and now >= next_due,
        "overdue": overdue,
        "next_due_at": next_due.isoformat() if next_due else None,
        "check_in_count": len(shift.check_ins),
        "is_blocked": shift.is_blocked,
        "block_reason": shift.block_reason,
        "interval_minutes": schedule.checkin_interval_minutes,
    }


# ── Screenshot upload (final clock-out screenshot) ───────────────────────────

@router.post("/upload-screenshot", response_model=ShiftOut)
async def upload_screenshot_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    t = _today()
    shift = db.query(Shift).filter(Shift.worker_id == user.id, Shift.date == t).first()
    if not shift or not shift.clock_in:
        raise HTTPException(400, "You must be clocked in to upload a screenshot")
    if shift.clock_out:
        raise HTTPException(400, "Shift already ended")
    if shift.is_blocked:
        raise HTTPException(403, f"Your shift is blocked: {shift.block_reason}")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, or WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(400, "Screenshot must be under 5MB")

    try:
        url = cloudinary_upload(contents, user.id, shift.id)
    except Exception as e:
        logger.error("Cloudinary upload failed: %s", e)
        raise HTTPException(500, "Failed to upload screenshot. Please try again.")

    shift.screenshot_url = url
    db.commit()
    db.refresh(shift)
    return ShiftOut.model_validate(shift)


# ── Clock Out ─────────────────────────────────────────────────────────────────

@router.post("/clock-out", response_model=ShiftOut)
def clock_out(db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = _today()
    shift = (
        db.query(Shift)
        .options(joinedload(Shift.check_ins))
        .filter(Shift.worker_id == user.id, Shift.date == t)
        .first()
    )
    if not shift or not shift.clock_in:
        raise HTTPException(400, "Not clocked in today")
    if shift.clock_out:
        raise HTTPException(409, "Already clocked out")
    if not shift.screenshot_url:
        raise HTTPException(400, "Please upload a final screenshot before clocking out")

    schedule = _get_schedule(db)
    now = datetime.now(timezone.utc)

    # Check for overdue check-in at clock-out time
    if _has_missed_checkin(shift, schedule, now) and not shift.is_blocked:
        shift.is_blocked = True
        shift.block_reason = "Missed a periodic check-in. Submit it before clocking out."
        db.commit()
        raise HTTPException(403, shift.block_reason)

    if shift.is_blocked:
        raise HTTPException(403, f"Shift is blocked: {shift.block_reason}. Contact admin.")

    shift.clock_out = now
    shift.total_minutes = int((now - shift.clock_in).total_seconds() / 60)
    db.commit()
    db.refresh(shift)
    logger.info("Worker %s clocked out. Duration: %sm, Check-ins: %s", user.id, shift.total_minutes, len(shift.check_ins))
    return ShiftOut.model_validate(shift)


# ── Today's shift ─────────────────────────────────────────────────────────────

@router.get("/today", response_model=Optional[ShiftOut])
def get_today(db: Session = Depends(get_db), user=Depends(get_current_user)):
    shift = db.query(Shift).filter(Shift.worker_id == user.id, Shift.date == _today()).first()
    return ShiftOut.model_validate(shift) if shift else None


# ── Shift list ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ShiftOut])
def list_shifts(
    worker_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(Shift)
    if user.role == UserRole.worker:
        q = q.filter(Shift.worker_id == user.id)
    elif worker_id:
        q = q.filter(Shift.worker_id == worker_id)
    if date_from:
        q = q.filter(Shift.date >= date_from)
    if date_to:
        q = q.filter(Shift.date <= date_to)
    return [ShiftOut.model_validate(s) for s in q.order_by(Shift.date.desc()).all()]


# ── Admin: all shifts today with punctuality ──────────────────────────────────

@router.get("/admin/today", response_model=List[ShiftOutFull])
def admin_today_shifts(db: Session = Depends(get_db), admin=Depends(require_admin)):
    shifts = (
        db.query(Shift)
        .options(joinedload(Shift.worker), joinedload(Shift.check_ins))
        .filter(Shift.date == _today())
        .all()
    )
    return [ShiftOutFull.model_validate(s) for s in shifts]


# ── Admin: historical shifts (any date range) ─────────────────────────────────
# FIX: new endpoint so admin can review past check-in screenshots

@router.get("/admin/history", response_model=List[ShiftOutFull])
def admin_shift_history(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    worker_id: Optional[int] = None,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    q = (
        db.query(Shift)
        .options(joinedload(Shift.worker), joinedload(Shift.check_ins))
    )
    if worker_id:
        q = q.filter(Shift.worker_id == worker_id)
    if date_from:
        q = q.filter(Shift.date >= date_from)
    if date_to:
        q = q.filter(Shift.date <= date_to)
    shifts = q.order_by(Shift.date.desc()).limit(200).all()
    return [ShiftOutFull.model_validate(s) for s in shifts]


# ── Admin: unblock a worker's shift ──────────────────────────────────────────

@router.post("/{shift_id}/unblock", response_model=ShiftOut)
def unblock_shift(
    shift_id: int,
    reason: Optional[str] = None,   # FIX: record why shift was unblocked
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(404, "Shift not found")
    shift.is_blocked = False
    # FIX: persist unblock reason in block_reason field for audit trail
    shift.block_reason = f"[UNBLOCKED by admin#{admin.id}" + (f": {reason}" if reason else "") + "]"
    db.commit()
    db.refresh(shift)
    logger.info("Admin %s unblocked shift %s. Reason: %s", admin.id, shift_id, reason or "none given")
    return ShiftOut.model_validate(shift)
