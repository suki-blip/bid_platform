import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

// PATCH /api/fundraising/projects/[id]/prospects/[prospectId]
//   Body: { estimated_amount?, status?, notes? }
//   Updates a single field set. When status changes to 'called', stamp contacted_at.
//
// DELETE /api/fundraising/projects/[id]/prospects/[prospectId]
//   Hard delete. Prospects aren't audited like payments — they're an internal worklist
//   the manager curates freely, so a real DELETE is fine.

const VALID_STATUSES = new Set(['pending', 'called', 'confirmed', 'declined']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; prospectId: string }> },
) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id: projectId, prospectId } = await params;

  // Verify the prospect exists for THIS project + THIS owner.
  const existing = await db().execute({
    sql: 'SELECT id, status FROM fr_project_prospects WHERE id = ? AND project_id = ? AND owner_id = ?',
    args: [prospectId, projectId, session.ownerId],
  });
  if (existing.rows.length === 0) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    estimated_amount?: number;
    status?: string;
    notes?: string | null;
  };

  const updates: string[] = [];
  const args: (string | number | null)[] = [];

  if (body.estimated_amount !== undefined) {
    const amt = Number(body.estimated_amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return NextResponse.json({ error: 'estimated_amount must be >= 0' }, { status: 400 });
    }
    updates.push('estimated_amount = ?');
    args.push(amt);
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    updates.push('status = ?');
    args.push(body.status);
    // Stamp contacted_at the first time we move out of 'pending'.
    if (body.status !== 'pending' && existing.rows[0].status === 'pending') {
      updates.push("contacted_at = datetime('now')");
    }
  }
  if (body.notes !== undefined) {
    updates.push('notes = ?');
    args.push(body.notes || null);
  }

  if (updates.length === 0) return NextResponse.json({ ok: true });

  args.push(prospectId);
  await db().execute({
    sql: `UPDATE fr_project_prospects SET ${updates.join(', ')} WHERE id = ?`,
    args,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; prospectId: string }> },
) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id: projectId, prospectId } = await params;

  await db().execute({
    sql: 'DELETE FROM fr_project_prospects WHERE id = ? AND project_id = ? AND owner_id = ?',
    args: [prospectId, projectId, session.ownerId],
  });
  return NextResponse.json({ ok: true });
}
