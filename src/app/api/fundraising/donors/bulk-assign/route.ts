// POST /api/fundraising/donors/bulk-assign
//
// Reassigns many donors to a single fundraiser at once. Manager-only.
// `fundraiser_id` can be null to unassign.
//
// Body: { ids: string[], fundraiser_id: string | null }
// Returns: { changed: number }

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { writeAudit } from '@/lib/fundraising-audit';

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const fundraiserId: string | null = body.fundraiser_id ? String(body.fundraiser_id) : null;
  if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: 'Too many ids (max 500)' }, { status: 400 });

  // If a fundraiser_id is provided, validate it belongs to this owner. We don't want to
  // accidentally assign donors to a fundraiser from a different org.
  if (fundraiserId) {
    const v = await db().execute({
      sql: 'SELECT id, name FROM team_members WHERE id = ? AND owner_id = ?',
      args: [fundraiserId, session.ownerId],
    });
    if (v.rows.length === 0) {
      return NextResponse.json({ error: 'Unknown fundraiser' }, { status: 400 });
    }
  }

  const placeholders = ids.map(() => '?').join(',');
  const result = await db().execute({
    sql: `UPDATE fr_donors SET assigned_to = ? WHERE owner_id = ? AND id IN (${placeholders})`,
    args: [fundraiserId, session.ownerId, ...ids],
  });

  const changed = Number(result.rowsAffected ?? ids.length);
  await writeAudit({
    ownerId: session.ownerId,
    actorId: session.actorId,
    actorLabel: session.name,
    entityType: 'donor',
    action: 'update',
    summary: fundraiserId
      ? `Bulk-assigned ${changed} donor${changed === 1 ? '' : 's'} to fundraiser`
      : `Bulk-unassigned ${changed} donor${changed === 1 ? '' : 's'}`,
    diff: { after: { bulk: true, fundraiser_id: fundraiserId, count: changed } },
  });

  return NextResponse.json({ changed });
}
