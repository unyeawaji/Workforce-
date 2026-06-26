"""
Admin invite system — invite-only admin registration.

POST   /invites              — admin: generate a one-time invite link
GET    /invites              — admin: list their own invites
DELETE /invites/{id}         — admin: revoke an unused invite
POST   /invites/register     — public: redeem token, create admin account
GET    /invites/validate/{token} — public: check if token is valid (for register page)
"""
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import AdminInvite, User, UserRole
from app.schemas.schemas import InviteCreate, InviteOut, InviteRegister, UserOut
from app.api.deps import require_system_admin
from app.core.security import get_password_hash

router = APIRouter(prefix="/invites", tags=["Invites"])
logger = logging.getLogger(__name__)

INVITE_TTL_HOURS = 72


def _now():
    return datetime.now(timezone.utc)


# ── Public: validate token ─────────────────────────────────────────────────────

@router.get("/validate/{token}")
def validate_invite(token: str, db: Session = Depends(get_db)):
    """Public: returns email_hint if token is valid. Used by register page on load."""
    invite = db.query(AdminInvite).filter(AdminInvite.token == token).first()
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite.used:
        raise HTTPException(410, "This invite has already been used")
    if invite.expires_at < _now():
        raise HTTPException(410, "This invite has expired")
    return {"valid": True, "email_hint": invite.email_hint}


# ── Public: register via invite ────────────────────────────────────────────────

@router.post("/register", response_model=UserOut, status_code=201)
def register_via_invite(payload: InviteRegister, db: Session = Depends(get_db)):
    """Public: redeem a token to create a new admin account."""
    invite = db.query(AdminInvite).filter(AdminInvite.token == payload.token).first()
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite.used:
        raise HTTPException(410, "This invite has already been used")
    if invite.expires_at < _now():
        raise HTTPException(410, "This invite link has expired")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(409, "Email already registered")

    # Admins have no admin_id — they are top-level
    new_admin = User(
        name=payload.name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=UserRole.admin,
        is_active=True,
        admin_id=None,
    )
    db.add(new_admin)
    db.flush()

    invite.used = True
    invite.used_by = new_admin.id
    invite.used_at = _now()

    db.commit()
    db.refresh(new_admin)
    logger.info(
        "New admin registered via invite: %s (invited by admin %s)",
        new_admin.email, invite.created_by
    )
    return UserOut.model_validate(new_admin)


# ── Admin: generate invite ─────────────────────────────────────────────────────

@router.post("", response_model=InviteOut, status_code=201)
def create_invite(
    payload: InviteCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin),
):
    token = secrets.token_urlsafe(32)
    invite = AdminInvite(
        token=token,
        created_by=admin.id,
        email_hint=payload.email_hint,
        expires_at=_now() + timedelta(hours=INVITE_TTL_HOURS),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    logger.info("Admin %s generated invite %s (hint: %s)", admin.id, invite.id, payload.email_hint)
    return InviteOut.model_validate(invite)


# ── Admin: list own invites ────────────────────────────────────────────────────

@router.get("", response_model=List[InviteOut])
def list_invites(db: Session = Depends(get_db), admin=Depends(require_system_admin)):
    invites = (
        db.query(AdminInvite)
        .filter(AdminInvite.created_by == admin.id)
        .order_by(AdminInvite.created_at.desc())
        .all()
    )
    return [InviteOut.model_validate(i) for i in invites]


# ── Admin: revoke invite ───────────────────────────────────────────────────────

@router.delete("/{invite_id}", status_code=204)
def revoke_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin),
):
    invite = db.query(AdminInvite).filter(
        AdminInvite.id == invite_id,
        AdminInvite.created_by == admin.id,
    ).first()
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite.used:
        raise HTTPException(400, "Cannot revoke an already-used invite")
    db.delete(invite)
    db.commit()
    logger.info("Admin %s revoked invite %s", admin.id, invite_id)
