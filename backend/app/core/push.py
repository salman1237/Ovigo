"""Web Push (technical document §18's push channel) via VAPID — self-hosted,
no third-party account or per-message cost, unlike SMS/email providers. pywebpush's
webpush() is synchronous (it uses requests under the hood), so it's run in a worker
thread — the same blocking-call lesson from core/storage.py's image-serving fix,
just applied here before it ever became a bug rather than after."""
import asyncio
import json
import logging

from pywebpush import WebPushException, webpush

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class PushSubscriptionGone(Exception):
    """The push service reports this subscription is no longer valid (404/410) —
    the caller should delete the corresponding PushSubscription row."""


async def send_push(endpoint: str, p256dh: str, auth: str, title: str, body: str, link: str | None) -> None:
    if not settings.vapid_configured:
        return

    payload = json.dumps({"title": title, "body": body, "link": link})

    def _send() -> None:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": f"mailto:{settings.vapid_claim_email}"},
        )

    try:
        await asyncio.to_thread(_send)
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status in (404, 410):
            raise PushSubscriptionGone from exc
        logger.exception("Web push failed for endpoint %s", endpoint)
