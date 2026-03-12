import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  await dbReady();
  const client = db();
  const result = await client.execute('SELECT key, value FROM admin_settings');
  const settings: Record<string, string> = {};
  for (const row of result.rows) {
    settings[row.key as string] = row.value as string;
  }
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  await dbReady();
  const client = db();
  const body = await request.json();

  const allowed = ['admin_email', 'notification_email', 'auto_suspend_days', 'auto_reminder_days'];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      await client.execute({
        sql: 'INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)',
        args: [key, String(body[key])],
      });
    }
  }

  // Log activity
  await client.execute({
    sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
    args: [crypto.randomUUID(), 'admin', 'Admin settings updated'],
  });

  return NextResponse.json({ ok: true });
}
