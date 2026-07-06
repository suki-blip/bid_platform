// GET  /api/fundraising/scheduled-calls  — list this owner's scheduled calls, newest first
// POST /api/fundraising/scheduled-calls  — create a scheduled call
//
// Body for POST: { to_number, steps, label?, scheduled_at }
//   to_number    — E.164, e.g. +18332783959
//   steps        — array of { waitSeconds, digits }: wait then key digits, repeated
//   scheduled_at — ISO datetime (UTC) when the call should go out

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const r = await db().execute({
    sql: `SELECT id, to_number, digits, pause_seconds, steps_json, label, scheduled_at, status,
                 call_status, error, attempts, recurring, recur_days, recur_time, last_fired_date, created_at
          FROM fr_scheduled_calls
          WHERE owner_id = ?
          ORDER BY recurring DESC, scheduled_at DESC
          LIMIT 200`,
    args: [session.ownerId],
  });

  return NextResponse.json({ calls: r.rows });
}

// Accept E.164 (+digits) loosely — strip spaces/dashes/parens first.
export function normalizeNumber(raw: string): string | null {
  const cleaned = String(raw || '').replace(/[\s\-().]/g, '');
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned;
  return null;
}

// Clean an incoming steps array into [{waitSeconds, digits}], dropping empty rows.
export function cleanSteps(raw: unknown): { waitSeconds: number; digits: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({
      waitSeconds: Math.max(0, Math.min(60, Math.round(Number((s as { waitSeconds?: unknown }).waitSeconds) || 0))),
      digits: String((s as { digits?: unknown }).digits || '').replace(/[^0-9*#w]/gi, ''),
    }))
    .filter((s) => s.digits || s.waitSeconds);
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const body = await request.json().catch(() => ({}));

  const toNumber = normalizeNumber(body.to_number);
  if (!toNumber) {
    return NextResponse.json(
      { error: 'Phone number must be in international format, e.g. +18332783959' },
      { status: 400 }
    );
  }

  const steps = cleanSteps(body.steps);
  if (steps.length === 0) {
    return NextResponse.json({ error: 'Add at least one step (wait + digits)' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const label = body.label ? String(body.label).slice(0, 200) : null;

  // Recurring: repeat on chosen weekdays at a local time. Otherwise: one-off at scheduled_at.
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
            VALUES (?, ?, ?, ?, ?, datetime('now'), 'recurring', 1, ?, ?, ?, ?)`,
      args: [id, session.ownerId, toNumber, JSON.stringify(steps), label,
             days.join(','), recurTime, recurTz, session.actorId],
    });
    return NextResponse.json({ ok: true, id, recurring: true });
  }

  const when = body.scheduled_at ? new Date(body.scheduled_at) : null;
  if (!when || isNaN(when.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
  }

  await db().execute({
    sql: `INSERT INTO fr_scheduled_calls
            (id, owner_id, to_number, steps_json, label, scheduled_at, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    args: [id, session.ownerId, toNumber, JSON.stringify(steps), label, when.toISOString(), session.actorId],
  });

  return NextResponse.json({ ok: true, id });
}

// Shared edit logic for PATCH on the [id] routes (fundraising + dialer). Only pending/recurring
// calls are editable. Returns a {body, status} pair for the caller to send.
export async function applyCallUpdate(
  ownerId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ body: object; status: number }> {
  const existing = await db().execute({
    sql: 'SELECT status FROM fr_scheduled_calls WHERE id = ? AND owner_id = ?',
    args: [id, ownerId],
  });
  if (existing.rows.length === 0) return { body: { error: 'Not found' }, status: 404 };
  const status = String(existing.rows[0].status);
  if (status !== 'pending' && status !== 'recurring') {
    return { body: { error: 'Only scheduled or recurring calls can be edited' }, status: 400 };
  }

  const toNumber = normalizeNumber(body.to_number as string);
  if (!toNumber) return { body: { error: 'Number must be international, e.g. +18332783959' }, status: 400 };
  const steps = cleanSteps(body.steps);
  if (steps.length === 0) return { body: { error: 'Add at least one step (wait + digits)' }, status: 400 };
  const label = body.label ? String(body.label).slice(0, 200) : null;

  if (body.recurring) {
    const rawDays = Array.isArray(body.recur_days) ? body.recur_days : [];
    const days = [...new Set(rawDays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))];
    const recurTime = String(body.recur_time || '');
    const recurTz = String(body.recur_tz || 'UTC');
    if (days.length === 0) return { body: { error: 'Pick at least one day of the week' }, status: 400 };
    if (!/^\d{1,2}:\d{2}$/.test(recurTime)) return { body: { error: 'Invalid repeat time' }, status: 400 };

    await db().execute({
      sql: `UPDATE fr_scheduled_calls
            SET to_number = ?, steps_json = ?, label = ?, recurring = 1,
                recur_days = ?, recur_time = ?, recur_tz = ?, status = 'recurring', last_fired_date = NULL
            WHERE id = ? AND owner_id = ?`,
      args: [toNumber, JSON.stringify(steps), label, days.join(','), recurTime, recurTz, id, ownerId],
    });
    return { body: { ok: true }, status: 200 };
  }

  const when = body.scheduled_at ? new Date(body.scheduled_at as string) : null;
  if (!when || isNaN(when.getTime())) return { body: { error: 'Invalid scheduled time' }, status: 400 };

  await db().execute({
    sql: `UPDATE fr_scheduled_calls
          SET to_number = ?, steps_json = ?, label = ?, recurring = 0,
              recur_days = NULL, recur_time = NULL, status = 'pending', attempts = 0,
              scheduled_at = ?, last_fired_date = NULL
          WHERE id = ? AND owner_id = ?`,
    args: [toNumber, JSON.stringify(steps), label, when.toISOString(), id, ownerId],
  });
  return { body: { ok: true }, status: 200 };
}
