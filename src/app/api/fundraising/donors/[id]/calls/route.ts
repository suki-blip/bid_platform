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
  const summary = (body.summary || '').trim();
  if (!summary && !body.transcript) {
    return NextResponse.json({ error: 'Summary or transcript is required' }, { status: 400 });
  }

  const callId = crypto.randomUUID();
  const occurredAt = body.occurred_at || new Date().toISOString();

  await db().batch(
    [
      {
        sql: `INSERT INTO fr_calls
                (id, owner_id, donor_id, fundraiser_id, project_id, direction, channel, occurred_at,
                 duration_min, outcome, summary, transcript, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          callId,
          session.ownerId,
          id,
          body.fundraiser_id || session.fundraiserId,
          body.project_id || null,
          body.direction || 'outbound',
          body.channel || 'phone',
          occurredAt,
          body.duration_min ? Number(body.duration_min) : null,
          body.outcome || null,
          summary,
          body.transcript || null,
          session.actorId,
        ],
      },
      {
        sql: 'UPDATE fr_donors SET last_contact_at = ? WHERE id = ?',
        args: [occurredAt, id],
      },
    ],
    'write',
  );

  return NextResponse.json({ id: callId });
}
