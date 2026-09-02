import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.fraud.models import FraudFlagStatus, FraudRuleType, FraudSeverity


class FraudFlagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_email: str | None
    rule_type: FraudRuleType
    severity: FraudSeverity
    score: int
    description: str
    context_id: uuid.UUID | None
    status: FraudFlagStatus
    resolved_by_id: uuid.UUID | None
    resolved_at: datetime | None
    resolution_note: str | None
    created_at: datetime


class FraudFlagResolve(BaseModel):
    resolution_note: str | None = None


class UserRiskReport(BaseModel):
    user_id: uuid.UUID
    risk_score: int
    flags: list[FraudFlagRead]


class ScanResult(BaseModel):
    new_flags_count: int
