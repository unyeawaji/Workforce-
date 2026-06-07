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
