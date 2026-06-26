"""
Public job application endpoint (no auth required).
GET  /applications/admins  — list all admins for the dropdown
POST /applications          — submit application (creates inactive worker account)
GET  /applications          — admin: list applications for their team
GET  /applications/pending-count — admin: count of pending applications (sidebar badge)
POST /applications/{id}/approve — admin: activate worker
POST /applications/{id}/reject  — admin: reject
"""
import logging
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import User, UserRole, JobApplication, ApplicationStatus
from app.schemas.schemas import JobApplicationCreate, JobApplicationOut, AdminPublic, PendingCountOut, SERVICES_CATALOG
from app.api.deps import require_admin, require_regular_admin
from app.core.security import get_password_hash
from app.core.push import notify_user
from pydantic import BaseModel

router = APIRouter(prefix="/applications", tags=["Applications"])
logger = logging.getLogger(__name__)


def _parse_services(services_str: str | None) -> list[str]:
    if not services_str:
        return []
    return [s.strip() for s in services_str.split(',') if s.strip()]


def _notify_admin_new_application(db: Session, admin_id: int, applicant_name: str) -> None:
    """Best-effort push notification to the admin's subscribed devices. Never raises."""
    notify_user(
        db, admin_id,
        title="📋 New job application",
        body=f"{applicant_name} just applied to join your team.",
    )


@router.get("/catalog")
def services_catalog():
    """Public: returns the full services catalog so the frontend can display labels/descriptions."""
    return SERVICES_CATALOG


@router.get("/admins", response_model=List[AdminPublic])
def list_admins_public(db: Session = Depends(get_db)):
    """Public: returns all active admin names+IDs+services for the apply-page."""
    admins = db.query(User).filter(
        User.role == UserRole.admin,
        User.is_active == True,
        User.is_system_admin == False,   # system admin is not a hireable team
    ).all()
    result = []
    for a in admins:
        result.append(AdminPublic(
            id=a.id,
            name=a.name,
            services=_parse_services(a.services),
        ))
    return result


@router.post("", response_model=JobApplicationOut, status_code=201)
def submit_application(payload: JobApplicationCreate, db: Session = Depends(get_db)):
    """Public: create application + inactive worker account."""
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(409, "Email already registered")
    admin = db.query(User).filter(User.id == payload.admin_id, User.role == UserRole.admin).first()
    if not admin:
        raise HTTPException(404, "Selected team not found")

    # Create the user account in inactive state
    user = User(
        name=payload.full_name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=UserRole.worker,
        is_active=False,          # activated by admin on approval
        admin_id=payload.admin_id,
    )
    db.add(user)
    db.flush()  # get user.id

    application = JobApplication(
        user_id=user.id,
        admin_id=payload.admin_id,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        cover_letter=payload.cover_letter,
        position_type=payload.position_type,
    )
    db.add(application)
    db.commit()
    db.refresh(application)
    logger.info("New application from %s for admin %s", payload.email, payload.admin_id)
    _notify_admin_new_application(db, admin.id, payload.full_name)
    return JobApplicationOut.model_validate(application)


@router.get("", response_model=List[JobApplicationOut])
def list_applications(db: Session = Depends(get_db), admin=Depends(require_admin)):
    """Admin: list all applications destined for this admin's team."""
    apps = (
        db.query(JobApplication)
        .filter(JobApplication.admin_id == admin.id)
        .order_by(JobApplication.applied_at.desc())
        .all()
    )
    return [JobApplicationOut.model_validate(a) for a in apps]


@router.get("/pending-count", response_model=PendingCountOut)
def pending_count(db: Session = Depends(get_db), admin=Depends(require_admin)):
    """Admin: lightweight count of pending applications, for the sidebar badge."""
    count = db.query(JobApplication).filter(
        JobApplication.admin_id == admin.id,
        JobApplication.status == ApplicationStatus.pending,
    ).count()
    return PendingCountOut(pending=count)


@router.post("/{app_id}/approve", response_model=JobApplicationOut)
def approve_application(app_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    app = db.query(JobApplication).filter(
        JobApplication.id == app_id,
        JobApplication.admin_id == admin.id,
    ).first()
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status != ApplicationStatus.pending:
        raise HTTPException(400, f"Application is already {app.status}")

    # Activate the worker account
    worker = db.query(User).filter(User.id == app.user_id).first()
    if worker:
        worker.is_active = True

    app.status = ApplicationStatus.approved
    app.reviewed_at = datetime.now(timezone.utc)
    app.reviewed_by = admin.id
    db.commit()
    db.refresh(app)
    logger.info("Admin %s approved application %s (worker %s)", admin.id, app_id, app.user_id)
    return JobApplicationOut.model_validate(app)


@router.post("/{app_id}/reject", response_model=JobApplicationOut)
def reject_application(app_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    app = db.query(JobApplication).filter(
        JobApplication.id == app_id,
        JobApplication.admin_id == admin.id,
    ).first()
    if not app:
        raise HTTPException(404, "Application not found")
    if app.status != ApplicationStatus.pending:
        raise HTTPException(400, f"Application is already {app.status}")

    app.status = ApplicationStatus.rejected
    app.reviewed_at = datetime.now(timezone.utc)
    app.reviewed_by = admin.id
    db.commit()
    db.refresh(app)
    logger.info("Admin %s rejected application %s", admin.id, app_id)
    return JobApplicationOut.model_validate(app)


# ── Admin: manage their team's services ───────────────────────────────────────

class ServicesUpdate(BaseModel):
    services: list[str]   # list of service keys from SERVICES_CATALOG


@router.get("/my-services")
def get_my_services(db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    """Regular admin: get their current services configuration."""
    return {"services": _parse_services(admin.services)}


@router.patch("/my-services")
def update_my_services(
    payload: ServicesUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    """Regular admin: set which services their team offers."""
    # Validate keys
    invalid = [s for s in payload.services if s not in SERVICES_CATALOG]
    if invalid:
        raise HTTPException(400, f"Unknown service keys: {invalid}")
    admin_row = db.query(User).filter(User.id == admin.id).first()
    admin_row.services = ','.join(payload.services)
    db.commit()
    logger.info("Admin %s updated services to: %s", admin.id, admin_row.services)
    return {"services": _parse_services(admin_row.services)}
