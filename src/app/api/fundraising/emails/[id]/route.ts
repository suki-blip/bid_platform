import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const body = await request.json();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  for (const f of ['subject', 'body', 'to_email', 'cc', 'send_at', 'status']) {
    if (f in body) {
      sets.push(`${f} = ?`);
      args.push(body[f] === '' ? null : body[f] ?? null);
    }
  }

  // Manual mark as sent (since we don't have email infra wired yet)
  if (body.status === 'sent' && !body.sent_at) {
    sets.push('sent_at = ?');
    args.push(new Date().toISOString());
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(id, session.ownerId);
  await db().execute({
    sql: `UPDATE fr_email_queue SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`,
    args,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;
  await db().execute({
    sql: 'DELETE FROM fr_email_queue WHERE id = ? AND owner_id = ?',
    args: [id, session.ownerId],
  });
  return NextResponse.json({ ok: true });
}
