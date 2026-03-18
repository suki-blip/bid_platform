import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';

export async function GET() {
  await dbReady();
  const client = db();
  const result = await client.execute('SELECT key, value FROM admin_settings');
  const settings: Record<string, string> = {};
  for (const row of result.rows) {
    // Don't expose password hash
    if (row.key === 'admin_password_hash') continue;
    settings[row.key as string] = row.value as string;
  }
  // Indicate if admin password is set
  const pwdResult = await client.execute("SELECT value FROM admin_settings WHERE key = 'admin_password_hash'");
  settings['has_admin_password'] = pwdResult.rows.length > 0 && pwdResult.rows[0].value ? 'true' : 'false';
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

  // Handle admin password change
  if (body.admin_password) {
    const pwdCheck = validatePassword(body.admin_password);
    if (!pwdCheck.valid) {
      return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
    }
    const hash = await hashPassword(body.admin_password);
    await client.execute({
      sql: "INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_password_hash', ?)",
      args: [hash],
    });
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'admin', 'Admin password changed'],
    });
  }

  // Log activity
  await client.execute({
    sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
    args: [crypto.randomUUID(), 'admin', 'Admin settings updated'],
  });

  return NextResponse.json({ ok: true });
}
