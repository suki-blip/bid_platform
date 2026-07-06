// GET /api/cron/dial
//
// Runs every minute (Vercel cron). Finds scheduled calls whose time has arrived and places
// them via Twilio. Twilio dials the target directly, presents your verified caller ID, and
// plays the configured DTMF step sequence (autonomous — no human on the line), then hangs up.
// The final outcome arrives later at /api/calls/status.
//
// Each due call is flipped to status='calling' before dialing so a slow run can't double-dial
// it on the next minute. Up to 3 attempts; after that it's marked failed.

import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getAppUrl } from '@/lib/email';
import { placeCall, twilioConfigured, stepsTwiml, type DialStep } from '@/lib/twilio';

const MAX_ATTEMPTS = 3;

// Parse the stored step sequence, falling back to the legacy single digits/pause fields.
export function parseSteps(stepsJson: unknown, digits: unknown, pauseSeconds: unknown): DialStep[] {
  if (typeof stepsJson === 'string' && stepsJson.trim()) {
    try {
      const arr = JSON.parse(stepsJson);
      if (Array.isArray(arr)) {
        return arr
          .map((s) => ({ waitSeconds: Number(s.waitSeconds) || 0, digits: String(s.digits || '') }))
          .filter((s) => s.digits || s.waitSeconds);
      }
    } catch {}
  }
  if (digits) return [{ waitSeconds: Number(pauseSeconds) || 0, digits: String(digits) }];
  return [];
}

// Current weekday / time / date in a given IANA timezone, for recurrence matching.
function nowInTz(tz: string): { weekday: number; minutes: number; date: string } {
  const safeTz = tz || 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(new Date());
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const wk: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: wk[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

export async function GET(request: Request) {
  try {
    await dbReady();

    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!twilioConfigured()) {
      return NextResponse.json({ ok: false, error: 'Twilio not configured', placed: 0 });
    }

    const nowIso = new Date().toISOString();
    const appUrl = getAppUrl();
    const callbackOk = !/localhost|127\.0\.0\.1/.test(appUrl); // Twilio can't reach local URLs

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const due = await db().execute({
      sql: `SELECT id, to_number, digits, pause_seconds, steps_json, attempts
            FROM fr_scheduled_calls
            WHERE attempts < ?
              AND (
                (status = 'pending' AND scheduled_at <= ?)
                OR (status = 'calling' AND scheduled_at <= ?)
              )
            ORDER BY scheduled_at ASC
            LIMIT 20`,
      args: [MAX_ATTEMPTS, nowIso, fiveMinAgo],
    });

    let placed = 0;
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const row of due.rows) {
      const id = row.id as string;
      const toNumber = row.to_number as string;
      const attempts = Number(row.attempts || 0);
      const steps = parseSteps(row.steps_json, row.digits, row.pause_seconds);

      await db().execute({
        sql: `UPDATE fr_scheduled_calls SET status = 'calling', attempts = ? WHERE id = ?`,
        args: [attempts + 1, id],
      });

      const result = await placeCall({
        to: toNumber,
        twiml: stepsTwiml(steps),
        record: true,
        statusCallback: callbackOk ? `${appUrl}/api/calls/status?id=${id}` : undefined,
      });

      if (result.success) {
        placed++;
        // Mark 'placed' (handed to Twilio) — NOT left 'calling', so the stuck-retry below
        // can't re-dial an already-placed call. The status callback later sets completed/failed.
        await db().execute({
          sql: `UPDATE fr_scheduled_calls SET status = 'placed', twilio_sid = ?, error = NULL WHERE id = ?`,
          args: [result.sid || null, id],
        });
      } else {
        const finalStatus = attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await db().execute({
          sql: `UPDATE fr_scheduled_calls SET status = ?, error = ? WHERE id = ?`,
          args: [finalStatus, result.error || 'unknown error', id],
        });
      }
      results.push({ id, ok: result.success, error: result.error });
    }

    // --- Recurring calls: fire when today's weekday matches and the local time has arrived
    // (within a 10-minute window), at most once per local day. ---
    const recurRows = await db().execute({
      sql: `SELECT id, to_number, digits, pause_seconds, steps_json,
                   recur_days, recur_time, recur_tz, last_fired_date
            FROM fr_scheduled_calls
            WHERE recurring = 1 AND status = 'recurring'`,
      args: [],
    });

    for (const row of recurRows.rows) {
      const id = row.id as string;
      const days = String(row.recur_days || '').split(',').map((d) => Number(d.trim())).filter((d) => !isNaN(d));
      const recurTime = String(row.recur_time || '');
      const tz = String(row.recur_tz || 'UTC');
      const lastFired = row.last_fired_date ? String(row.last_fired_date) : '';
      if (!days.length || !/^\d{1,2}:\d{2}$/.test(recurTime)) continue;

      const now = nowInTz(tz);
      const [h, m] = recurTime.split(':').map(Number);
      const targetMinutes = h * 60 + m;
      const dueNow = days.includes(now.weekday) && now.minutes >= targetMinutes && now.minutes <= targetMinutes + 10;
      if (!dueNow || lastFired === now.date) continue;

      // Claim today's run immediately so a slow run can't double-fire.
      await db().execute({
        sql: `UPDATE fr_scheduled_calls SET last_fired_date = ? WHERE id = ?`,
        args: [now.date, id],
      });

      const steps = parseSteps(row.steps_json, row.digits, row.pause_seconds);
      const result = await placeCall({
        to: row.to_number as string,
        twiml: stepsTwiml(steps),
        statusCallback: callbackOk ? `${appUrl}/api/calls/status?id=${id}` : undefined,
      });

      await db().execute({
        sql: `UPDATE fr_scheduled_calls SET twilio_sid = COALESCE(?, twilio_sid), call_status = ?, error = ? WHERE id = ?`,
        args: [result.sid || null, result.success ? 'queued' : 'failed', result.success ? null : (result.error || 'error'), id],
      });
      if (result.success) placed++;
      results.push({ id, ok: result.success, error: result.error });
    }

    return NextResponse.json({ ok: true, placed, checked: due.rows.length + recurRows.rows.length, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/dial] error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
