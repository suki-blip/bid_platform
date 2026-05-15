// POST /api/fundraising/donors/bulk-tag
//
// Adds (or removes) one tag across multiple donors in a single call. Donors store tags as
// a JSON array in the `tags` TEXT column, so we read-merge-write each row in a small loop.
// Manager-only.
//
// Body: { ids: string[], tag: string, op: 'add' | 'remove' }
// Returns: { changed: number, ids_affected: string[] }

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
  const tag = String(body.tag || '').trim();
  const op = body.op === 'remove' ? 'remove' : 'add';
  if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: 'Too many ids (max 500)' }, { status: 400 });
  if (!tag) return NextResponse.json({ error: 'tag required' }, { status: 400 });

  // Pull the current tags JSON for each donor, then merge + write back. Done serially so
  // we never lose concurrent edits to the same donor row.
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db().execute({
    sql: `SELECT id, tags FROM fr_donors WHERE owner_id = ? AND id IN (${placeholders})`,
    args: [session.ownerId, ...ids],
  });

  let changed = 0;
  const ids_affected: string[] = [];
  for (const row of rows.rows) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(String(row.tags || '[]'));
    } catch {
      tags = [];
    }
    const had = tags.includes(tag);
    if (op === 'add' && !had) tags.push(tag);
    if (op === 'remove' && had) tags = tags.filter((t) => t !== tag);
    if (op === 'add' === had) continue; // already in desired state
    await db().execute({
      sql: 'UPDATE fr_donors SET tags = ? WHERE id = ?',
      args: [JSON.stringify(tags), String(row.id)],
    });
    changed++;
    ids_affected.push(String(row.id));
  }

  await writeAudit({
    ownerId: session.ownerId,
    actorId: session.actorId,
    actorLabel: session.name,
    entityType: 'donor',
    action: 'update',
    summary: `Bulk ${op === 'add' ? 'tagged' : 'untagged'} ${changed} donor${changed === 1 ? '' : 's'} with "${tag}"`,
    diff: { after: { bulk: true, op, tag, count: changed } },
  });

  return NextResponse.json({ changed, ids_affected });
}
