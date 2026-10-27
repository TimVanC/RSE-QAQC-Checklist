import type { Db } from '@/src/db';
import { auditLog } from '@/src/db/schema/system';

export interface AuditEntry {
  userId: string | null;
  entity: 'checklist' | 'checklist_answer' | 'app_user' | 'pay_period' | 'app_setting' | 'technician' | 'call_log';
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** Append-only audit trail (PRD section 4, item 9). Never contains customer data beyond ids. */
export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    userId: entry.userId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
