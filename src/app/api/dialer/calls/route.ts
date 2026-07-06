// GET  /api/dialer/calls  — list the dialer's calls (passcode-gated, standalone /dialer page)
// POST /api/dialer/calls  — create a one-off or recurring call
//
// Same behavior as /api/fundraising/scheduled-calls but authed by the dialer passcode instead
// of a BidMaster login, and scoped to the resolved dialer owner.

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { isDialerAuthed, resolveDialerOwnerId } from '@/lib/dialer-auth';
import { normalizeNumber, cleanSteps } from '@/app/api/fundraising/scheduled-calls/route';

async function guard(): Promise<{ ownerId: string } | { error: string; status: number }> {
  if (!(await isDialerAuthed())) return { error: 'Locked', status: 401 };
  const ownerId = await resolveDialerOwnerId();
  if (!ownerId) return { error: 'No account configured for the dialer', status: 500 };
  return { ownerId };
}

export async function GET() {
  const g = await guard();
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await dbReady();

  const r = await db().execute({
    sql: `SELECT id, to_number, digits, pause_seconds, steps_json, label, scheduled_at, status,
                 call_status, error, attempts, recurring, recur_days, recur_time, last_fired_date, created_at
          FROM fr_scheduled_calls
          WHERE owner_id = ?
          ORDER BY recurring DESC, scheduled_at DESC
          LIMIT 200`,
    args: [g.ownerId],
  });
  return NextResponse.json({ calls: r.rows });
}

export async function POST(request: Request) {
  const g = await guard();
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await dbReady();

  const body = await request.json().catch(() => ({}));

  const toNumber = normalizeNumber(body.to_number);
  if (!toNumber) return NextResponse.json({ error: 'Number must be international, e.g. +18332783959' }, { status: 400 });

  const steps = cleanSteps(body.steps);
  if (steps.length === 0) return NextResponse.json({ error: 'Add at least one step (wait + digits)' }, { status: 400 });

  const id = crypto.randomUUID();
  const label = body.label ? String(body.label).slice(0, 200) : null;

  if (body.recurring) {
    const days = Array.isArray(body.recur_days)
      ? [...new Set(body.recur_days.map((d: unknown) => Number(d)).filter((d: number) => d >= 0 && d <= 6))]
      : [];
    const recurTime = String(body.recur_time || '');
    const recurTz = String(body.recur_tz || 'UTC');
    if (days.length === 0) return NextResponse.json({ error: 'Pick at least one day of the week' }, { status: 400 });
    if (!/^\d{1,2}:\d{2}$/.test(recurTime)) return NextResponse.json({ error: 'Invalid repeat time' }, { status: 400 });

    await db().execute({
      sql: `INSERT INTO fr_scheduled_calls
              (id, owner_id, to_number, steps_json, label, scheduled_at, status,
               recurring, recur_days, recur_time, recur_tz, created_by)
            VALUES (?, ?, ?, ?, ?, datetime('now'), 'recurring', 1, ?, ?, ?, 'dialer')`,
      args: [id, g.ownerId, toNumber, JSON.stringify(steps), label, days.join(','), recurTime, recurTz],
    });
    return NextResponse.json({ ok: true, id, recurring: true });
  }

  const when = body.scheduled_at ? new Date(body.scheduled_at) : null;
  if (!when || isNaN(when.getTime())) return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });

  await db().execute({
    sql: `INSERT INTO fr_scheduled_calls
            (id, owner_id, to_number, steps_json, label, scheduled_at, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', 'dialer')`,
    args: [id, g.ownerId, toNumber, JSON.stringify(steps), label, when.toISOString()],
  });
  return NextResponse.json({ ok: true, id });
}
