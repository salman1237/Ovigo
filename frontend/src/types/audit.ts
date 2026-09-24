export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
}
