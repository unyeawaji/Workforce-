import logging
from datetime import datetime, date, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import Shift, User, UserRole
from app.schemas.schemas import ShiftOut
from app.api.deps import get_current_user
from app.core.cloudinary_config import upload_screenshot

router = APIRouter(prefix="/shifts", tags=["Shifts"])
logger = logging.getLogger(__name__)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5MB


def today() -> date:
    return datetime.now(timezone.utc).date()


@router.post("/clock-in", response_model=ShiftOut)
def clock_in(db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = today()
    shift = db.query(Shift).filter(Shift.worker_id == user.id, Shift.date == t).first()
    if shift and shift.clock_in:
        raise HTTPException(409, "Already clocked in today")
    if not shift:
        shift = Shift(worker_id=user.id, date=t)
        db.add(shift)
    shift.clock_in = datetime.now(timezone.utc)
    db.commit(); db.refresh(shift)
    logger.info(f"Worker {user.id} clocked in")
    return ShiftOut.model_validate(shift)


@router.post("/upload-screenshot", response_model=ShiftOut)
async def upload_screenshot_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Upload a screenshot before clocking out."""
    t = today()
    shift = db.query(Shift).filter(Shift.worker_id == user.id, Shift.date == t).first()
    if not shift or not shift.clock_in:
        raise HTTPException(400, "You must be clocked in to upload a screenshot")
    if shift.clock_out:
        raise HTTPException(400, "Shift already ended")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, or WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(400, "Screenshot must be under 5MB")

    try:
        url = upload_screenshot(contents, user.id, shift.id)
    except Exception as e:
        logger.error(f"Cloudinary upload failed: {e}")
        raise HTTPException(500, "Failed to upload screenshot. Please try again.")

    shift.screenshot_url = url
    db.commit(); db.refresh(shift)
    logger.info(f"Worker {user.id} uploaded screenshot for shift {shift.id}")
    return ShiftOut.model_validate(shift)


@router.post("/clock-out", response_model=ShiftOut)
def clock_out(db: Session = Depends(get_db), user=Depends(get_current_user)):
    t = today()
    shift = db.query(Shift).filter(Shift.worker_id == user.id, Shift.date == t).first()
    if not shift or not shift.clock_in:
        raise HTTPException(400, "Not clocked in today")
    if shift.clock_out:
        raise HTTPException(409, "Already clocked out")
    if not shift.screenshot_url:
        raise HTTPException(400, "Please upload a screenshot before clocking out")
    now = datetime.now(timezone.utc)
    shift.clock_out = now
    shift.total_minutes = int((now - shift.clock_in).total_seconds() / 60)
    db.commit(); db.refresh(shift)
    logger.info(f"Worker {user.id} clocked out. Duration: {shift.total_minutes}m")
    return ShiftOut.model_validate(shift)


@router.get("/today", response_model=Optional[ShiftOut])
def get_today(db: Session = Depends(get_db), user=Depends(get_current_user)):
    shift = db.query(Shift).filter(Shift.worker_id == user.id, Shift.date == today()).first()
    return ShiftOut.model_validate(shift) if shift else None


@router.get("/", response_model=List[ShiftOut])
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
