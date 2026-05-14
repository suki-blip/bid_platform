import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { runAutoChargeBatch } from '@/lib/fundraising-auto-charge';

// GET /api/cron/auto-charge
//
// Triggered by Vercel Cron (see vercel.json) once a day. Charges every pledge installment
// that has hit its due_date and is linked to a saved card.
//
// Auth: Vercel cron requests include the `Authorization: Bearer <CRON_SECRET>` header. We
// also accept the request if it originates with a `?key=<CRON_SECRET>` query param (handy
// for manual testing via curl). Without either, we 403 — preventing public abuse of the
// endpoint (which would queue real charges).

export const runtime = 'nodejs';
// Keep this hot-ish so Vercel doesn't cold-start every call.
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — enough for hundreds of charges

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured — refuse to run rather than silently accept everyone.
    // Set CRON_SECRET in Vercel project env vars.
    return false;
  }
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get('key') === secret) return true;
  return false;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await dbReady();

  try {
    const results = await runAutoChargeBatch();
    const summary = {
      total: results.length,
      approved: results.filter((r) => r.result === 'approved').length,
      declined: results.filter((r) => r.result === 'declined').length,
      errored: results.filter((r) => r.result === 'error').length,
    };
    return NextResponse.json({ ok: true, summary, results });
  } catch (err) {
    console.error('[cron/auto-charge] batch threw:', err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'unknown' },
      { status: 500 },
    );
  }
}
