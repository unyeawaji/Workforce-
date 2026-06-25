import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import decode_token, create_export_token, verify_export_token
from app.db.database import get_db
from app.models.models import Activity, Shift, User, UserRole, VerificationStatus
from app.schemas.schemas import DashboardStats, WeeklyStats, WeeklyPoint
from app.api.deps import require_admin
from app.core.team import team_worker_ids

router = APIRouter(prefix="/analytics", tags=["Analytics"])
logger = logging.getLogger(__name__)


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(db: Session = Depends(get_db), admin=Depends(require_admin)):
    today = datetime.now(timezone.utc).date()
    wids = team_worker_ids(db, admin.id)
    if not wids:
        return DashboardStats(active_workers_today=0, total_minutes_today=0,
                              pending_verifications=0, total_activities_today=0,
                              approved_today=0, rejected_today=0)

    active_workers = (
        db.query(func.count(Shift.id))
        .filter(Shift.date == today, Shift.clock_in.isnot(None), Shift.worker_id.in_(wids))
        .scalar() or 0
    )
    total_minutes = (
        db.query(func.coalesce(func.sum(Shift.total_minutes), 0))
        .filter(Shift.date == today, Shift.worker_id.in_(wids)).scalar() or 0
    )
    pending = (
        db.query(func.count(Activity.id))
        .filter(Activity.verification_status == VerificationStatus.pending,
                Activity.worker_id.in_(wids))
        .scalar() or 0
    )
    total_today = (
        db.query(func.count(Activity.id))
        .filter(Activity.date == today, Activity.worker_id.in_(wids)).scalar() or 0
    )
    approved_today = (
        db.query(func.count(Activity.id))
        .filter(Activity.date == today, Activity.verification_status == VerificationStatus.approved,
                Activity.worker_id.in_(wids))
        .scalar() or 0
    )
    rejected_today = (
        db.query(func.count(Activity.id))
        .filter(Activity.date == today, Activity.verification_status == VerificationStatus.rejected,
                Activity.worker_id.in_(wids))
        .scalar() or 0
    )
    return DashboardStats(
        active_workers_today=active_workers,
        total_minutes_today=int(total_minutes),
        pending_verifications=pending,
        total_activities_today=total_today,
        approved_today=approved_today,
        rejected_today=rejected_today,
    )


@router.get("/weekly", response_model=WeeklyStats)
def weekly(db: Session = Depends(get_db), admin=Depends(require_admin)):
    today = datetime.now(timezone.utc).date()
    wids = team_worker_ids(db, admin.id)
    points = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        minutes = 0
        tasks = 0
        if wids:
            minutes = (
                db.query(func.coalesce(func.sum(Shift.total_minutes), 0))
                .filter(Shift.date == d, Shift.worker_id.in_(wids)).scalar() or 0
            )
            tasks = (
                db.query(func.count(Activity.id))
                .filter(Activity.date == d, Activity.verification_status == VerificationStatus.approved,
                        Activity.worker_id.in_(wids))
                .scalar() or 0
            )
        points.append(WeeklyPoint(day=d.strftime("%a"), hours=round(minutes / 60, 1), tasks=tasks))
    return WeeklyStats(points=points)


@router.get("/export-token")
def get_export_token(db: Session = Depends(get_db), admin=Depends(require_admin)):
    token, _jti = create_export_token(str(admin.id))
    return {"export_token": token}


@router.get("/export")
def export(
    request: Request,
    worker_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    verification_status: Optional[str] = None,
    fmt: str = Query("csv", pattern="^(csv|xlsx)$"),
    export_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if not export_token:
        raise HTTPException(status_code=401, detail="export_token is required")
    result = verify_export_token(export_token)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or expired export token")
    user_id, jti = result

    from app.models.models import UsedExportToken
    if db.query(UsedExportToken).filter(UsedExportToken.jti == jti).first():
        raise HTTPException(status_code=401, detail="Export token already used")
    db.add(UsedExportToken(jti=jti))
    db.commit()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.query(UsedExportToken).filter(UsedExportToken.used_at < cutoff).delete(synchronize_session=False)
    db.commit()

    admin = db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
    if not admin or admin.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    wids = team_worker_ids(db, admin.id)

    q = (
        db.query(
            Activity.id, Activity.date, Activity.task_title, Activity.description,
            Activity.start_time, Activity.end_time, Activity.status,
            Activity.verification_status, Activity.admin_feedback, Activity.verified_at,
            User.name.label("worker_name"), User.email.label("worker_email"),
            User.department,
            Shift.client_name,
        )
        .join(User, User.id == Activity.worker_id)
        .join(Shift, (Shift.worker_id == Activity.worker_id) & (Shift.date == Activity.date), isouter=True)
        .filter(Activity.worker_id.in_(wids))
    )
    if worker_id:
        q = q.filter(Activity.worker_id == worker_id)
    if date_from:
        q = q.filter(Activity.date >= date_from)
    if date_to:
        q = q.filter(Activity.date <= date_to)
    if verification_status:
        q = q.filter(Activity.verification_status == verification_status)

    rows = q.order_by(Activity.date.desc()).all()
    df = pd.DataFrame(rows, columns=[
        "ID", "Date", "Task", "Description", "Start", "End",
        "Status", "Verification", "Admin Feedback", "Verified At",
        "Worker Name", "Worker Email", "Department", "Client",
    ])

    if fmt == "xlsx":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as w:
            df.to_excel(w, index=False, sheet_name="Activities")
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=activities.xlsx"},
        )

    buf = io.BytesIO(df.to_csv(index=False).encode())
    return StreamingResponse(
        buf, media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=activities.csv"},
    )
