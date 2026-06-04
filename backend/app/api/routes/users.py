import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.security import get_password_hash
from app.db.database import get_db
from app.models.models import User, UserRole
from app.schemas.schemas import UserCreate, UserUpdate, UserOut
from app.api.deps import require_admin, get_current_user

router = APIRouter(prefix="/users", tags=["Users"])
logger = logging.getLogger(__name__)


@router.post("/", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        name=payload.name, email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=payload.role, department=payload.department,
    )
    db.add(user); db.commit(); db.refresh(user)
    logger.info(f"Admin {admin.id} created user {user.id}")
    return UserOut.model_validate(user)


@router.get("/", response_model=List[UserOut])
def list_users(
    role: Optional[UserRole] = None,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return [UserOut.model_validate(u) for u in q.order_by(User.created_at.desc()).all()]


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != UserRole.admin and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    db.commit(); db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user); db.commit()
