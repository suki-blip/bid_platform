import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getContractorSession } from '@/lib/session';
import { hashPassword, verifyPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    await dbReady();
    const client = db();
    const session = await getContractorSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { current_password, new_password } = await request.json();

    if (!current_password || !new_password) {
      return NextResponse.json({ error: 'Both current and new passwords are required' }, { status: 400 });
    }

    if (new_password.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
    }

    // Fetch current password hash
    const result = await client.execute({
      sql: 'SELECT password_hash FROM saas_users WHERE id = ?',
      args: [session.userId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const storedHash = result.rows[0].password_hash as string;

    // Verify current password
    const valid = await verifyPassword(current_password, storedHash);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
    }

    // Hash and store new password
    const newHash = await hashPassword(new_password);
    await client.execute({
      sql: 'UPDATE saas_users SET password_hash = ? WHERE id = ?',
      args: [newHash, session.userId],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
