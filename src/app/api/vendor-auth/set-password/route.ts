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

    // Look up invitation by token to find vendor
    const invResult = await db().execute({
      sql: `SELECT bi.vendor_id, v.name, v.email, v.password_hash
            FROM bid_invitations bi
            JOIN vendors v ON v.id = bi.vendor_id
            WHERE bi.token = ?`,
      args: [token],
    });

    const inv = invResult.rows[0] as Record<string, unknown> | undefined;
    if (!inv) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    if (inv.password_hash) {
      return NextResponse.json({ error: 'Password already set. Please log in.' }, { status: 409 });
    }

    // Hash and save password
    const hash = await hashPassword(password);
    await db().execute({
      sql: 'UPDATE vendors SET password_hash = ? WHERE id = ?',
      args: [hash, String(inv.vendor_id)],
    });

    // Auto-login: create session
    const sessionToken = createVendorSession(String(inv.vendor_id));

    const response = NextResponse.json({
      success: true,
      vendor: { id: inv.vendor_id, name: inv.name, email: inv.email },
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
    console.error('Set password error:', error);
    return NextResponse.json({ error: 'Failed to set password' }, { status: 500 });
  }
}
