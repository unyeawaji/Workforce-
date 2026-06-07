import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.db.database import get_db
from app.models.models import Activity, Shift, User, UserRole, VerificationStatus
from app.schemas.schemas import ActivityCreate, ActivityUpdate, ActivityOut, VerifyActivityRequest
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/activities", tags=["Activities"])
logger = logging.getLogger(__name__)


def _get(activity_id: int, db: Session) -> ActivityOut:
    a = (db.query(Activity)
         .options(joinedload(Activity.worker))
         .filter(Activity.id == activity_id).first())
    if not a:
        raise HTTPException(404, "Activity not found")
    return ActivityOut.model_validate(a)


def _assert_editable(a: Activity):
    if a.verification_status == VerificationStatus.approved:
        raise HTTPException(403, "Activity is approved and locked — immutable audit trail.")


@router.post("", response_model=ActivityOut, status_code=201)
def create(payload: ActivityCreate, db=Depends(get_db), user=Depends(get_current_user)):
    if user.role != UserRole.worker:
        raise HTTPException(400, "Only workers can submit activities")

    # FIX: validate end_time > start_time
    if payload.end_time and payload.end_time <= payload.start_time:
        raise HTTPException(400, "end_time must be after start_time")

    # FIX: activity date must have a corresponding clocked-in shift for that worker
    shift = db.query(Shift).filter(
        Shift.worker_id == user.id,
        Shift.date == payload.date,
        Shift.clock_in.isnot(None),
    ).first()
    if not shift:
        raise HTTPException(400, "You can only log activities for days you have clocked in")

    a = Activity(worker_id=user.id, **payload.model_dump())
    db.add(a); db.commit(); db.refresh(a)
    logger.info("Worker %s created activity %s on shift %s", user.id, a.id, shift.id)
    return _get(a.id, db)


@router.get("", response_model=List[ActivityOut])
def list_activities(
    worker_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    verification_status: Optional[VerificationStatus] = None,
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(Activity).options(joinedload(Activity.worker))
    if user.role == UserRole.worker:
        q = q.filter(Activity.worker_id == user.id)
    elif worker_id:
        q = q.filter(Activity.worker_id == worker_id)
    if date_from:
        q = q.filter(Activity.date >= date_from)
    if date_to:
        q = q.filter(Activity.date <= date_to)
    if verification_status:
        q = q.filter(Activity.verification_status == verification_status)
    if status:
        q = q.filter(Activity.status == status)
    items = q.order_by(Activity.date.desc(), Activity.created_at.desc()).offset(skip).limit(limit).all()
    return [ActivityOut.model_validate(a) for a in items]


@router.get("/{activity_id}", response_model=ActivityOut)
def get_activity(activity_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    a = _get(activity_id, db)
    if user.role == UserRole.worker and a.worker_id != user.id:
        raise HTTPException(403, "Access denied")
    return a


@router.patch("/{activity_id}", response_model=ActivityOut)
def update(activity_id: int, payload: ActivityUpdate, db=Depends(get_db), user=Depends(get_current_user)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "Activity not found")
    if user.role == UserRole.worker and a.worker_id != user.id:
        raise HTTPException(403, "Access denied")
    _assert_editable(a)

    # FIX: validate end_time > start_time on update too
    new_start = payload.start_time or a.start_time
    new_end = payload.end_time if payload.end_time is not None else a.end_time
    if new_end and new_end <= new_start:
        raise HTTPException(400, "end_time must be after start_time")

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    a.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _get(activity_id, db)


@router.delete("/{activity_id}", status_code=204)
def delete(activity_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "Activity not found")
    if user.role == UserRole.worker and a.worker_id != user.id:
        raise HTTPException(403, "Access denied")
    _assert_editable(a)
    db.delete(a); db.commit()


@router.post("/{activity_id}/verify", response_model=ActivityOut)
def verify(activity_id: int, payload: VerifyActivityRequest, db=Depends(get_db), admin=Depends(require_admin)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "Activity not found")
    a.verification_status = payload.verification_status
    a.admin_feedback = payload.admin_feedback
    a.verified_by = admin.id
    a.verified_at = datetime.now(timezone.utc)
    a.updated_at = datetime.now(timezone.utc)
    db.commit()
    logger.info("Admin %s set activity %s → %s", admin.id, activity_id, payload.verification_status)
    return _get(activity_id, db)
