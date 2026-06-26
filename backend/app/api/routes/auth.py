import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.security import verify_password, create_access_token
from app.core.limiter import limiter
from app.db.database import get_db
from app.models.models import User
from app.schemas.schemas import LoginRequest, TokenResponse, UserOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


def _user_out_with_admin(user: User, db: Session) -> UserOut:
    """Build a UserOut and, for workers/clients, attach the name of the admin who manages them."""
    out = UserOut.model_validate(user)
    if user.admin_id:
        admin = db.query(User).filter(User.id == user.admin_id).first()
        out.admin_name = admin.name if admin else None
    return out


@router.post("/login", response_model=TokenResponse)
@limiter.limit("20/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account suspended")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    logger.info("Login: %s", user.email)
    return TokenResponse(access_token=token, user=_user_out_with_admin(user, db))


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _user_out_with_admin(current_user, db)
