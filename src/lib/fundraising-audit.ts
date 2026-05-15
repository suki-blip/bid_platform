// Audit log writer + reader.
//
// `writeAudit()` is the single entry point for recording a change — it never throws (just
// console.error's on failure) so audit logging never blocks the actual write. Routes call
// it after the data write succeeds.
//
// Reads happen via /api/fundraising/audit-log which queries the fr_audit_log table
// directly; this module exists mainly for type-safe writes.

import crypto from 'crypto';
import { db } from './db';

export type AuditEntity = 'donor' | 'pledge' | 'payment' | 'blast' | 'template' | 'card';

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'restore'
  | 'charge_success' | 'charge_failed'
  | 'send' | 'test_send';

export interface AuditWriteParams {
  ownerId: string;
  actorId?: string | null;
  actorLabel?: string | null;
  entityType: AuditEntity;
  entityId?: string | null;
  action: AuditAction;
  summary?: string | null;
  /** Optional shallow before/after diff. Anything serializable. */
  diff?: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
}

export async function writeAudit(params: AuditWriteParams): Promise<void> {
  try {
    await db().execute({
      sql: `INSERT INTO fr_audit_log
              (id, owner_id, actor_id, actor_label, entity_type, entity_id, action, summary, diff_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        params.ownerId,
        params.actorId ?? null,
        params.actorLabel ?? null,
        params.entityType,
        params.entityId ?? null,
        `${params.entityType}.${params.action}`,
        params.summary ?? null,
        params.diff ? JSON.stringify(params.diff) : null,
      ],
    });
  } catch (err) {
    // Never propagate audit-log failures — the underlying business action already succeeded.
    console.error('[fundraising-audit] write failed:', err);
  }
}
