import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();
  const { id } = await params;

  const body = await request.json();
  const sets: string[] = [];
  const args: (string | number)[] = [];

  if ('name' in body) {
    sets.push('name = ?');
    args.push(String(body.name).trim());
  }
  if ('status' in body) {
    sets.push('status = ?');
    args.push(String(body.status));
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(id, session.ownerId);
  await db().execute({
    sql: `UPDATE team_members SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`,
    args,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();
  const { id } = await params;

  // Unassign donors first (set assigned_to to NULL where this fundraiser is assigned)
  await db().execute({
    sql: 'UPDATE fr_donors SET assigned_to = NULL WHERE assigned_to = ? AND owner_id = ?',
    args: [id, session.ownerId],
  });

  await db().execute({
    sql: "UPDATE team_members SET status = 'removed' WHERE id = ? AND owner_id = ?",
    args: [id, session.ownerId],
  });
  return NextResponse.json({ ok: true });
}
