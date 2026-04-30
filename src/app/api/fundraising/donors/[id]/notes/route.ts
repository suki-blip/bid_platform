import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const text = (body.body || '').trim();
  if (!text) return NextResponse.json({ error: 'Note body is required' }, { status: 400 });

  const noteId = crypto.randomUUID();
  await db().execute({
    sql: 'INSERT INTO fr_notes (id, donor_id, author_type, author_id, author_name, body, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [noteId, id, session.role, session.actorId, session.name, text, body.pinned ? 1 : 0],
  });
  return NextResponse.json({ id: noteId });
}
