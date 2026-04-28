import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    await dbReady();
    const client = db();
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
    }

    // Find valid token
    const result = await client.execute({
      sql: `SELECT prt.*, su.name, su.email FROM password_reset_tokens prt
            JOIN saas_users su ON su.id = prt.user_id
            WHERE prt.token = ? AND prt.used = 0`,
      args: [token],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired reset link. Please request a new one.' }, { status: 400 });
    }

    const resetToken = result.rows[0] as any;

    // Check expiration
    if (new Date(resetToken.expires_at) < new Date()) {
      await client.execute({
        sql: 'UPDATE password_reset_tokens SET used = 1 WHERE id = ?',
        args: [resetToken.id],
      });
      return NextResponse.json({ error: 'Reset link has expired. Please request a new one.' }, { status: 400 });
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update user password
    await client.execute({
      sql: 'UPDATE saas_users SET password_hash = ? WHERE id = ?',
      args: [passwordHash, resetToken.user_id],
    });

    // Mark token as used
    await client.execute({
      sql: 'UPDATE password_reset_tokens SET used = 1 WHERE id = ?',
      args: [resetToken.id],
    });

    // Log activity
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'password_reset', `Password reset completed for ${resetToken.email}`],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
