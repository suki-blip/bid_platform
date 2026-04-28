import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

function getSession(request: NextRequest) {
  const cookie = request.cookies.get('contractor-auth')?.value;
  if (!cookie) return null;
  try { return JSON.parse(Buffer.from(cookie, 'base64').toString()); } catch { return null; }
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbReady();
    const result = await db().execute({
      sql: 'SELECT notification_settings FROM saas_users WHERE id = ?',
      args: [session.userId],
    });

    if (result.rows.length === 0) return NextResponse.json({});

    const raw = result.rows[0].notification_settings as string || '{}';
    try { return NextResponse.json(JSON.parse(raw)); } catch { return NextResponse.json({}); }
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const settings = await request.json();
    await dbReady();

    await db().execute({
      sql: 'UPDATE saas_users SET notification_settings = ? WHERE id = ?',
      args: [JSON.stringify(settings), session.userId],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error saving notification settings:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
