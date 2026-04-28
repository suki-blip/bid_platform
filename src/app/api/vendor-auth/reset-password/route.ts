import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';
import { createVendorSession, VENDOR_COOKIE, MAX_AGE } from '@/lib/vendor-auth';

export async function POST(request: Request) {
  try {
    await dbReady();
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Find vendor by reset token
    const result = await db().execute({
      sql: `SELECT id, name, email, reset_token_expires FROM vendors WHERE reset_token = ? AND status = 'active'`,
      args: [token],
    });

    const vendor = result.rows[0] as Record<string, unknown> | undefined;
    if (!vendor) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    // Check expiry
    const expires = vendor.reset_token_expires as string;
    if (expires && new Date(expires + 'Z') < new Date()) {
      return NextResponse.json({ error: 'Reset link has expired. Please request a new one.' }, { status: 400 });
    }

    // Hash and save new password, clear reset token
    const hash = await hashPassword(password);
    await db().execute({
      sql: 'UPDATE vendors SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      args: [hash, String(vendor.id)],
    });

    // Auto-login
    const sessionToken = createVendorSession(String(vendor.id));

    const response = NextResponse.json({
      success: true,
      vendor: { id: vendor.id, name: vendor.name, email: vendor.email },
    });

    response.cookies.set(VENDOR_COOKIE, sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
