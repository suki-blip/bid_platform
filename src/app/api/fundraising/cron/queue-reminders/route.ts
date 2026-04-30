import { NextRequest, NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { queueUpcomingReminders } from '@/lib/fundraising-reminders';

export async function POST(request: NextRequest) {
  await dbReady();

  // Two modes:
  // 1) Authenticated user (manual button click) — only their own org
  // 2) System cron with x-cron-secret header — all orgs
  const cronSecret = request.headers.get('x-cron-secret');
  const isCron = cronSecret && cronSecret === process.env.CRON_SECRET;

  let ownerId: string | null = null;
  if (!isCron) {
    const session = await getFundraisingSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
    ownerId = session.ownerId;
  }

  const url = new URL(request.url);
  const leadDays = Number(url.searchParams.get('lead_days') || '7');

  const result = await queueUpcomingReminders(ownerId, leadDays);
  return NextResponse.json(result);
}
