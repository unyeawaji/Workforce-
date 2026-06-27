import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.security import get_password_hash, verify_password
from app.db.database import get_db
from app.models.models import User, UserRole, Shift
from app.schemas.schemas import UserCreate, UserUpdate, UserOut
from app.api.deps import require_admin, require_regular_admin, require_system_admin, get_current_user

router = APIRouter(prefix="/users", tags=["Users"])
logger = logging.getLogger(__name__)


@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    # Workers and clients created by an admin are automatically assigned to that admin
    admin_id = None if payload.role == UserRole.admin else admin.id
    user = User(
        name=payload.name, email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=payload.role, department=payload.department,
        admin_id=admin_id,
    )
    db.add(user); db.commit(); db.refresh(user)
    logger.info("Admin %s created user %s (%s)", admin.id, user.id, payload.role)
    out = UserOut.model_validate(user)
    if admin_id:
        out.admin_name = admin.name
    return out


@router.get("", response_model=List[UserOut])
def list_users(
    role: Optional[UserRole] = None,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    # Admins only see workers/clients in their own team
    q = db.query(User).filter(User.admin_id == admin.id)
    if role:
        q = q.filter(User.role == role)
    results = []
    for u in q.order_by(User.created_at.desc()).all():
        out = UserOut.model_validate(u)
        out.admin_name = admin.name   # every row here belongs to this admin by definition
        results.append(out)
    return results


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    admin_name = None
    if current_user.role == UserRole.admin:
        # Admin can only look up their own team members
        user = db.query(User).filter(
            User.id == user_id,
            User.admin_id == current_user.id,
        ).first()
        admin_name = current_user.name if user else None
    elif current_user.id == user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.admin_id:
            admin = db.query(User).filter(User.id == user.admin_id).first()
            admin_name = admin.name if admin else None
    else:
        raise HTTPException(status_code=403, detail="Access denied")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    out = UserOut.model_validate(user)
    out.admin_name = admin_name
    return out


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    user = db.query(User).filter(User.id == user_id, User.admin_id == admin.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id and payload.role is not None and payload.role != UserRole.admin:
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    data = payload.model_dump(exclude_none=True)
    deactivation_reason = data.pop("deactivation_reason", None)

    # Deactivation: capture audit trail and close out any open shift so it
    # doesn't sit clocked-in forever after the worker is offboarded.
    if data.get("is_active") is False and user.is_active:
        user.deactivated_reason = deactivation_reason
        user.deactivated_at = datetime.now(timezone.utc)
        open_shift = db.query(Shift).filter(
            Shift.worker_id == user.id, Shift.clock_in.isnot(None), Shift.clock_out.is_(None),
        ).first()
        if open_shift:
            now = datetime.now(timezone.utc)
            open_shift.clock_out = now
            open_shift.total_minutes = max(0, int((now - open_shift.clock_in).total_seconds() / 60))
            logger.info("Auto-closed open shift %s for deactivated worker %s", open_shift.id, user.id)
    # Reactivation: clear the offboarding record
    elif data.get("is_active") is True and not user.is_active:
        user.deactivated_reason = None
        user.deactivated_at = None

    for k, v in data.items():
        setattr(user, k, v)
    db.commit(); db.refresh(user)
    logger.info("Admin %s updated user %s", admin.id, user.id)
    out = UserOut.model_validate(user)
    out.admin_name = admin.name
    return out


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    user = db.query(User).filter(User.id == user_id, User.admin_id == admin.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user); db.commit()
    logger.info("Admin %s deleted user %s", admin.id, user_id)


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/me/change-password", status_code=204)
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    logger.info("User %s changed their password", user.id)
