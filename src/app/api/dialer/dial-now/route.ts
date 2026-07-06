// POST /api/dialer/dial-now  — place a dialer call immediately (autonomous, or listen-test if
// listen_number is given). Passcode-gated, owner-scoped. Mirrors the fundraising dial-now.

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getAppUrl } from '@/lib/email';
import { isDialerAuthed, resolveDialerOwnerId } from '@/lib/dialer-auth';
import { placeCall, twilioConfigured, stepsTwiml, listenTwiml } from '@/lib/twilio';
import { normalizeNumber, cleanSteps } from '@/app/api/fundraising/scheduled-calls/route';

export async function POST(request: Request) {
  if (!(await isDialerAuthed())) return NextResponse.json({ error: 'Locked' }, { status: 401 });
  const ownerId = await resolveDialerOwnerId();
  if (!ownerId) return NextResponse.json({ error: 'No account configured' }, { status: 500 });
  await dbReady();

  if (!twilioConfigured()) return NextResponse.json({ error: 'Twilio is not configured on the server' }, { status: 400 });

  const body = await request.json().catch(() => ({}));

  const toNumber = normalizeNumber(body.to_number);
  if (!toNumber) return NextResponse.json({ error: 'Target number must be international, e.g. +18332783959' }, { status: 400 });

  const steps = cleanSteps(body.steps);
  if (steps.length === 0) return NextResponse.json({ error: 'Add at least one step (wait + digits)' }, { status: 400 });

  const listenNumber = body.listen_number ? normalizeNumber(body.listen_number) : null;
  if (body.listen_number && !listenNumber) {
    return NextResponse.json({ error: 'Listen number must be international, e.g. +16465097458' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const appUrl = getAppUrl();
  const callbackOk = !/localhost|127\.0\.0\.1/.test(appUrl);

  await db().execute({
    sql: `INSERT INTO fr_scheduled_calls
            (id, owner_id, to_number, steps_json, label, scheduled_at, status, attempts, created_by)
          VALUES (?, ?, ?, ?, ?, datetime('now'), 'calling', 1, 'dialer')`,
    args: [id, ownerId, toNumber, JSON.stringify(steps),
           body.label ? String(body.label).slice(0, 200) : (listenNumber ? 'Test (listen)' : 'Call now')],
  });

  const result = await placeCall({
    to: listenNumber || toNumber,
    twiml: listenNumber ? listenTwiml(toNumber, steps) : stepsTwiml(steps),
    record: true,
    statusCallback: callbackOk ? `${appUrl}/api/calls/status?id=${id}` : undefined,
  });

  if (result.success) {
    await db().execute({
      sql: `UPDATE fr_scheduled_calls SET status = 'placed', twilio_sid = ?, error = NULL WHERE id = ?`,
      args: [result.sid || null, id],
    });
    return NextResponse.json({ ok: true, id, sid: result.sid });
  }
  await db().execute({
    sql: `UPDATE fr_scheduled_calls SET status = 'failed', error = ? WHERE id = ?`,
    args: [result.error || 'unknown error', id],
  });
  return NextResponse.json({ error: result.error || 'Call failed' }, { status: 502 });
}
