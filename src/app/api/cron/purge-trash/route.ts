// GET /api/cron/purge-trash
//
// Runs daily via Vercel Cron (see vercel.json). Hard-removes any fr_recycle_bin entries
// older than 30 days — the cutoff is enforced in fundraising-recycle-bin.purgeExpired().
//
// Same auth model as the auto-charge cron: Authorization: Bearer <CRON_SECRET> or ?key=.

import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { purgeExpired } from '@/lib/fundraising-recycle-bin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Purge is a single DELETE — won't take long, but bump just in case the table grows.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
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
    const result = await purgeExpired();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/purge-trash] failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message || 'unknown' }, { status: 500 });
  }
}
