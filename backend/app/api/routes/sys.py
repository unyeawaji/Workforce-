"""
System-admin oversight endpoints.
All routes require is_system_admin = True.

GET  /sys/admins                       — list all regular admins with team stats
GET  /sys/admins/{id}/workers          — all workers under a specific admin
GET  /sys/admins/{id}/clients          — all clients under a specific admin
GET  /sys/admins/{id}/shifts           — recent shifts across an admin's team
GET  /sys/admins/{id}/activities       — activity feed across an admin's team
PATCH /sys/admins/{id}                 — suspend / reactivate an admin
DELETE /sys/admins/{id}                — permanently remove an admin
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db
from app.models.models import User, UserRole, Shift, Activity, VerificationStatus, CheckIn
from app.schemas.schemas import (
    AdminTeamSummary, UserOut, ShiftOutFull, ActivityOut, ClientOut,
)
from app.api.deps import require_system_admin
from app.core.security import get_password_hash
from pydantic import BaseModel

router = APIRouter(prefix="/sys", tags=["System"])
logger = logging.getLogger(__name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_regular_admin(admin_id: int, db: Session) -> User:
    admin = db.query(User).filter(
        User.id == admin_id,
        User.role == UserRole.admin,
        User.is_system_admin == False,
    ).first()
    if not admin:
        raise HTTPException(404, "Admin not found")
    return admin


def _team_wids(admin_id: int, db: Session) -> list[int]:
    return [r.id for r in db.query(User.id).filter(
        User.admin_id == admin_id, User.role == UserRole.worker,
    ).all()]


def _build_summary(admin: User, db: Session) -> AdminTeamSummary:
    today = datetime.now(timezone.utc).date()
    wids = _team_wids(admin.id, db)

    worker_count = db.query(User).filter(
        User.admin_id == admin.id, User.role == UserRole.worker).count()
    client_count = db.query(User).filter(
        User.admin_id == admin.id, User.role == UserRole.client).count()
    active_today = 0
    pending_activities = 0
    if wids:
        active_today = db.query(func.count(Shift.id)).filter(
            Shift.date == today,
            Shift.clock_in.isnot(None),
            Shift.clock_out.is_(None),
            Shift.worker_id.in_(wids),
        ).scalar() or 0
        pending_activities = db.query(func.count(Activity.id)).filter(
            Activity.verification_status == VerificationStatus.pending,
            Activity.worker_id.in_(wids),
        ).scalar() or 0

    return AdminTeamSummary(
        id=admin.id, name=admin.name, email=admin.email,
        is_active=admin.is_active, created_at=admin.created_at,
        worker_count=worker_count, client_count=client_count,
        active_today=active_today, pending_activities=pending_activities,
    )


# ── List all admins ───────────────────────────────────────────────────────────

@router.get("/admins", response_model=List[AdminTeamSummary])
def list_all_admins(db: Session = Depends(get_db), _=Depends(require_system_admin)):
    admins = (
        db.query(User)
        .filter(User.role == UserRole.admin, User.is_system_admin == False)
        .order_by(User.created_at.desc())
        .all()
    )
    return [_build_summary(a, db) for a in admins]


# ── Workers under an admin ────────────────────────────────────────────────────

@router.get("/admins/{admin_id}/workers", response_model=List[UserOut])
def list_admin_workers(
    admin_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_system_admin),
):
    admin = _get_regular_admin(admin_id, db)
    workers = db.query(User).filter(
        User.admin_id == admin.id,
        User.role == UserRole.worker,
    ).order_by(User.created_at.desc()).all()
    out = []
    for w in workers:
        o = UserOut.model_validate(w)
        o.admin_name = admin.name
        out.append(o)
    return out


# ── Clients under an admin ────────────────────────────────────────────────────

@router.get("/admins/{admin_id}/clients", response_model=List[ClientOut])
def list_admin_clients(
    admin_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_system_admin),
):
    from app.models.models import ClientWorker
    admin = _get_regular_admin(admin_id, db)
    clients = db.query(User).filter(
        User.admin_id == admin.id,
        User.role == UserRole.client,
    ).order_by(User.created_at.desc()).all()
    result = []
    for c in clients:
        wids = [cw.worker_id for cw in db.query(ClientWorker).filter(ClientWorker.client_id == c.id).all()]
        result.append(ClientOut(
            id=c.id, name=c.name, email=c.email, role=c.role,
            department=c.department, is_active=c.is_active,
            admin_id=c.admin_id, admin_name=admin.name,
            created_at=c.created_at, assigned_worker_ids=wids,
        ))
    return result


# ── Recent shifts across an admin's team ─────────────────────────────────────

@router.get("/admins/{admin_id}/shifts", response_model=List[ShiftOutFull])
def list_admin_shifts(
    admin_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_system_admin),
):
    admin = _get_regular_admin(admin_id, db)
    wids = _team_wids(admin.id, db)
    if not wids:
        return []
    q = (
        db.query(Shift)
        .options(joinedload(Shift.worker), joinedload(Shift.check_ins))
        .filter(Shift.worker_id.in_(wids))
    )
    if date_from:
        q = q.filter(Shift.date >= date_from)
    if date_to:
        q = q.filter(Shift.date <= date_to)
    shifts = q.order_by(Shift.date.desc()).limit(100).all()
    return [ShiftOutFull.model_validate(s) for s in shifts]


# ── Activity feed across an admin's team ─────────────────────────────────────

@router.get("/admins/{admin_id}/activities", response_model=List[ActivityOut])
def list_admin_activities(
    admin_id: int,
    verification_status: Optional[VerificationStatus] = None,
    limit: int = Query(100, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_system_admin),
):
    admin = _get_regular_admin(admin_id, db)
    wids = _team_wids(admin.id, db)
    if not wids:
        return []
    q = (
        db.query(Activity)
        .options(joinedload(Activity.worker))
        .filter(Activity.worker_id.in_(wids))
    )
    if verification_status:
        q = q.filter(Activity.verification_status == verification_status)
    activities = q.order_by(Activity.date.desc(), Activity.created_at.desc()).limit(limit).all()
    return [ActivityOut.model_validate(a) for a in activities]


# ── Suspend / reactivate an admin ─────────────────────────────────────────────

class AdminStatusUpdate(BaseModel):
    is_active: bool


@router.patch("/admins/{admin_id}", response_model=AdminTeamSummary)
def update_admin_status(
    admin_id: int,
    payload: AdminStatusUpdate,
    db: Session = Depends(get_db),
    sys_admin=Depends(require_system_admin),
):
    admin = _get_regular_admin(admin_id, db)
    if admin.id == sys_admin.id:
        raise HTTPException(400, "Cannot modify your own account")
    admin.is_active = payload.is_active
    db.commit()
    db.refresh(admin)
    action = "reactivated" if payload.is_active else "suspended"
    logger.info("System admin %s %s admin %s", sys_admin.id, action, admin_id)
    return _build_summary(admin, db)


# ── Remove an admin ───────────────────────────────────────────────────────────

@router.delete("/admins/{admin_id}", status_code=204)
def delete_admin(
    admin_id: int,
    db: Session = Depends(get_db),
    sys_admin=Depends(require_system_admin),
):
    """
    Permanently remove an admin account.
    Their workers and clients have admin_id set to NULL (ON DELETE SET NULL in FK),
    so no worker/client data is lost — they become unassigned.
    """
    admin = _get_regular_admin(admin_id, db)
    if admin.id == sys_admin.id:
        raise HTTPException(400, "Cannot delete your own account")
    db.delete(admin)
    db.commit()
    logger.info("System admin %s permanently deleted admin %s (%s)", sys_admin.id, admin_id, admin.email)
