// GET /api/fundraising/trash
//
// Lists the current owner's recycle bin contents — donors, pledges, and payments that were
// soft-deleted in the last 30 days and are still restorable. Returned in deletion-order
// newest first so the most recently deleted thing is the easiest to recover.
//
// Server filters to the calling owner only. Each row exposes just the summary fields the
// UI needs — the full snapshot JSON is kept server-side because it can be large and isn't
// needed for the list view.

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  // Only show entries within the 30-day retention window — anything older is fair game
  // for the purge cron and the user shouldn't see it as "restorable".
  const r = await db().execute({
    sql: `SELECT id, entity_type, entity_id, summary, deleted_by, deleted_at,
                 CAST((julianday('now') - julianday(deleted_at)) AS INTEGER) AS days_in_bin
          FROM fr_recycle_bin
          WHERE owner_id = ?
            AND deleted_at >= datetime('now', '-30 days')
          ORDER BY deleted_at DESC`,
    args: [session.ownerId],
  });

  // Map each row to a UI-friendly shape — most importantly, days_remaining tells the user
  // how long they have to act before the row is auto-purged.
  const items = r.rows.map((row) => ({
    id: String(row.id),
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    summary: String(row.summary),
    deleted_by: row.deleted_by ? String(row.deleted_by) : null,
    deleted_at: String(row.deleted_at),
    days_in_bin: Number(row.days_in_bin || 0),
    days_remaining: Math.max(0, 30 - Number(row.days_in_bin || 0)),
  }));

  return NextResponse.json({ items });
}
