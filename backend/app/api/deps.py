import logging
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.security import decode_token
from app.db.database import get_db
from app.models.models import User, UserRole

logger = logging.getLogger(__name__)
bearer = HTTPBearer()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})
    if payload.get("purpose") is not None:
        raise HTTPException(status_code=401, detail="Invalid token type",
                            headers={"WWW-Authenticate": "Bearer"})
    user = db.query(User).filter(User.id == int(payload.get("sub", 0))).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account suspended")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_system_admin(user: User = Depends(get_current_user)) -> User:
    """Only the system (super) admin can call this endpoint."""
    if user.role != UserRole.admin or not user.is_system_admin:
        raise HTTPException(status_code=403, detail="System admin access required")
    return user


def require_regular_admin(user: User = Depends(get_current_user)) -> User:
    """Only non-system admins (those who manage workers) can call this endpoint."""
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    if user.is_system_admin:
        raise HTTPException(status_code=403, detail="System admin cannot perform this action")
    return user


def require_worker(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.worker:
        raise HTTPException(status_code=403, detail="Worker access required")
    return user


def require_client(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.client:
        raise HTTPException(status_code=403, detail="Client access required")
    return user
