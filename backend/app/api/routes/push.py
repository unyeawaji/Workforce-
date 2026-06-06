"""
Push notification routes.

POST /push/subscribe       — worker saves their browser subscription
DELETE /push/unsubscribe   — worker removes subscription (logout / permission revoked)
GET  /push/vapid-public-key — returns the VAPID public key the frontend needs
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.database import get_db
from app.models.models import PushSubscription
from app.api.deps import get_current_user
from app.core.config import settings

router = APIRouter(prefix="/push", tags=["Push Notifications"])
logger = logging.getLogger(__name__)


class PushSubscribePayload(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.get("/vapid-public-key")
def get_vapid_public_key():
    """Return the VAPID public key — called by the frontend before subscribing."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(503, "Push notifications not configured on this server")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe", status_code=201)
def subscribe(
    payload: PushSubscribePayload,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Save or update a push subscription for this worker.
    Called once after the browser grants notification permission.
    """
    ua = request.headers.get("user-agent", "")[:300]

    # Upsert by endpoint — if this device already subscribed, refresh the keys
    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == payload.endpoint
    ).first()

    if existing:
        existing.p256dh = payload.p256dh
        existing.auth = payload.auth
        existing.worker_id = user.id   # re-assign if worker changed on this device
    else:
        sub = PushSubscription(
            worker_id=user.id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
            user_agent=ua,
        )
        db.add(sub)

    db.commit()
    logger.info("Worker %s registered push subscription (%.40s…)", user.id, payload.endpoint)
    return {"status": "subscribed"}


@router.delete("/unsubscribe")
def unsubscribe_delete(
    payload: PushSubscribePayload,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Remove a push subscription (DELETE variant — kept for compatibility)."""
    return _do_unsubscribe(payload, db, user)


@router.post("/unsubscribe")
def unsubscribe_post(
    payload: PushSubscribePayload,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    # FIX: POST variant because some browsers/proxies strip bodies from DELETE requests
    """Remove a push subscription (POST variant — preferred)."""
    return _do_unsubscribe(payload, db, user)


def _do_unsubscribe(payload: PushSubscribePayload, db: Session, user):
    deleted = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.worker_id == user.id,
        )
        .delete()
    )
    db.commit()
    logger.info("Worker %s removed push subscription (%d rows)", user.id, deleted)
    return {"status": "unsubscribed"}
