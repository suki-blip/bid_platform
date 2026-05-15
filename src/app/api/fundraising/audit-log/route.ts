// GET /api/fundraising/audit-log
//
// Returns recent audit-log entries for the current owner, newest first. Optional filters:
//   entity_type — donor | pledge | payment | blast | template | card
//   entity_id   — drill into one specific entity's history
//   actor_id    — filter by who did the action
//   limit       — default 100, max 500
//
// Manager-only. The audit log is a sensitive surface — fundraisers shouldn't see what
// other team members are editing.

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const url = new URL(request.url);
  const entityType = url.searchParams.get('entity_type') || '';
  const entityId = url.searchParams.get('entity_id') || '';
  const actorId = url.searchParams.get('actor_id') || '';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);

  const where: string[] = ['owner_id = ?'];
  const args: (string | number)[] = [session.ownerId];
  if (entityType) {
    where.push('entity_type = ?');
    args.push(entityType);
  }
  if (entityId) {
    where.push('entity_id = ?');
    args.push(entityId);
  }
  if (actorId) {
    where.push('actor_id = ?');
    args.push(actorId);
  }

  const r = await db().execute({
    sql: `SELECT id, actor_id, actor_label, entity_type, entity_id, action, summary, diff_json, at
          FROM fr_audit_log
          WHERE ${where.join(' AND ')}
          ORDER BY at DESC
          LIMIT ?`,
    args: [...args, limit],
  });

  return NextResponse.json({
    entries: r.rows.map((row) => ({
      id: String(row.id),
      actor_id: row.actor_id ? String(row.actor_id) : null,
      actor_label: row.actor_label ? String(row.actor_label) : null,
      entity_type: String(row.entity_type),
      entity_id: row.entity_id ? String(row.entity_id) : null,
      action: String(row.action),
      summary: row.summary ? String(row.summary) : null,
      diff: row.diff_json ? safeJson(String(row.diff_json)) : null,
      at: String(row.at),
    })),
  });
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
