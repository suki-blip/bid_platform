// GET /api/calls/recording?id=<scheduled_call_id>
//
// Streams the call's Twilio recording (MP3) so it can be played in the browser. Accessible
// either via a BidMaster/fundraising session or the standalone dialer passcode — and only for
// calls belonging to that owner. Twilio media needs Basic Auth, so we proxy the bytes.

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { isDialerAuthed, resolveDialerOwnerId } from '@/lib/dialer-auth';
import { fetchCallRecording } from '@/lib/twilio';

async function requesterOwnerId(): Promise<string | null> {
  const session = await getFundraisingSession();
  if (session) return session.ownerId;
  if (await isDialerAuthed()) return await resolveDialerOwnerId();
  return null;
}

export async function GET(request: Request) {
  const ownerId = await requesterOwnerId();
  if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await dbReady();
  const r = await db().execute({
    sql: 'SELECT twilio_sid, owner_id FROM fr_scheduled_calls WHERE id = ?',
    args: [id],
  });
  if (r.rows.length === 0 || String(r.rows[0].owner_id) !== ownerId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const sid = r.rows[0].twilio_sid ? String(r.rows[0].twilio_sid) : '';
  if (!sid) return NextResponse.json({ error: 'This call has no recording' }, { status: 404 });

  const rec = await fetchCallRecording(sid);
  if (!rec.ok) return NextResponse.json({ error: rec.error }, { status: rec.status });

  return new Response(rec.body, {
    headers: { 'Content-Type': rec.contentType, 'Cache-Control': 'private, max-age=3600' },
  });
}
