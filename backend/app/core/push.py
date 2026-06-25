"""
Web Push notification helper.

Sends push messages to worker browser subscriptions using VAPID signing.

Environment variables required:
  VAPID_PRIVATE_KEY  — base64url-encoded private key  (generate once, see README)
  VAPID_PUBLIC_KEY   — base64url-encoded public key   (sent to frontend)
  VAPID_MAILTO       — contact email shown in push headers, e.g. mailto:admin@yoursite.com
"""
import json
import logging
from typing import Optional
from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session
from app.core.config import settings

logger = logging.getLogger(__name__)


def send_push(endpoint: str, p256dh: str, auth_key: str,
              title: str, body: str, url: str = "/") -> bool:
    """
    Send a single Web Push notification.
    Returns True on success, False on failure.
    Automatically removes the subscription from DB if the browser rejects it (410 Gone).
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_MAILTO:
        logger.warning("Push skipped — VAPID_PRIVATE_KEY / VAPID_MAILTO not configured")
        return False

    payload = json.dumps({"title": title, "body": body, "url": url})
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}},
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_MAILTO},
        )
        return True
    except WebPushException as e:
        status = e.response.status_code if e.response is not None else None
        if status in (404, 410):
            # Subscription no longer valid — caller should delete it
            logger.info("Push subscription expired (status %s) — endpoint: %.60s…", status, endpoint)
            return None   # None signals "delete this subscription"
        logger.error("WebPush failed (status %s): %s", status, e)
        return False
    except Exception as e:
        logger.error("Push send error: %s", e)
        return False


def notify_user(db: Session, user_id: int, title: str, body: str, url: str = "/") -> int:
    """
    Fan out a push notification to every subscription a user (worker, admin, or
    client) has registered, pruning any that the browser has rejected.

    This is the single place that owns the "loop subscriptions, send, clean up
    stale ones" mechanics — previously duplicated in three call sites (new
    application alerts, new review alerts, check-in reminders), which made it
    easy for the cleanup logic to drift out of sync between them.

    Returns the number of notifications successfully sent. Never raises —
    a failed or misconfigured push setup should never break the caller's
    actual business logic (saving a review, approving an application, etc).
    """
    from app.models.models import PushSubscription  # local import: avoids push.py depending on models at module load

    try:
        subs = db.query(PushSubscription).filter(PushSubscription.worker_id == user_id).all()
    except Exception as e:
        logger.warning("notify_user: failed to load subscriptions for user %s: %s", user_id, e)
        return 0

    sent = 0
    stale_ids = []
    for sub in subs:
        try:
            result = send_push(
                endpoint=sub.endpoint, p256dh=sub.p256dh, auth_key=sub.auth,
                title=title, body=body, url=url,
            )
            if result is None:
                stale_ids.append(sub.id)
            elif result:
                sent += 1
        except Exception as e:
            logger.warning("notify_user: send failed for subscription %s: %s", sub.id, e)

    if stale_ids:
        try:
            db.query(PushSubscription).filter(PushSubscription.id.in_(stale_ids)).delete(synchronize_session=False)
            db.commit()
            logger.info("notify_user: removed %d stale push subscription(s) for user %s", len(stale_ids), user_id)
        except Exception as e:
            logger.warning("notify_user: failed to clean up stale subscriptions: %s", e)

    return sent
