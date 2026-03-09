import { createAdminClient } from "@/shared/lib/supabase/admin";

/**
 * Fire-and-forget audit log entry via the insert_audit_log DB function.
 * Never throws — audit failures must never block the main operation.
 */
export async function logAudit({
  organizationId,
  userId,
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
}: {
  organizationId: string | null;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}) {
  if (!organizationId) return;
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).rpc("insert_audit_log", {
      p_org_id: organizationId,
      p_user_id: userId,
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_old_values: oldValues ?? null,
      p_new_values: newValues ?? null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", action, entityType, entityId, err);
  }
}
