"""Thin helper for writing audit log entries. Call this from any admin action —
don't write to `audit_logs` directly, so the shape stays consistent."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.models import AuditLog


async def record(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    extra: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            extra=extra,
        )
    )
    await db.commit()
