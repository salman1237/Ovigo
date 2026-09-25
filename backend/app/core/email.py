"""Best-effort transactional email via SMTP (technical document §18's email
channel). A broken or unconfigured mail server should never break the app flow
that triggered a notification — see notifications/service.py::notify, which
fires this from a background task and never awaits or surfaces its result."""
import logging
from email.message import EmailMessage

import aiosmtplib

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def send_email(to: str, subject: str, body: str) -> None:
    if not settings.smtp_configured:
        return

    message = EmailMessage()
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=settings.smtp_use_tls,
        )
    except Exception:
        logger.exception("Failed to send email to %s", to)
