import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await dbReady();

  const r = await db().execute({
    sql: 'SELECT payment_gateway_url FROM saas_users WHERE id = ?',
    args: [session.ownerId],
  });
  return NextResponse.json({
    gateway_url: (r.rows[0]?.payment_gateway_url as string | null) || '',
  });
}

export async function PATCH(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await dbReady();

  const body = await request.json().catch(() => ({}));
  let url: string | null = (body.gateway_url || '').toString().trim();
  if (!url) url = null;

  // Light validation: must start with https:// when provided.
  if (url && !/^https:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Gateway URL must start with https://' }, { status: 400 });
  }

  await db().execute({
    sql: 'UPDATE saas_users SET payment_gateway_url = ? WHERE id = ?',
    args: [url, session.ownerId],
  });
  return NextResponse.json({ ok: true });
}
