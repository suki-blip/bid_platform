import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { createVendorSession, VENDOR_COOKIE, MAX_AGE } from '@/lib/vendor-auth';

export async function POST(request: Request) {
  try {
    await dbReady();
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const result = await db().execute({
      sql: `SELECT * FROM vendors WHERE email = ? AND status = 'active'`,
      args: [email.toLowerCase().trim()],
    });

    const vendor = result.rows[0] as Record<string, unknown> | undefined;

    if (!vendor) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (!vendor.password_hash) {
      return NextResponse.json({
        error: 'Account not set up yet. Use your invitation link to set a password.',
      }, { status: 401 });
    }

    const valid = await verifyPassword(password, vendor.password_hash as string);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Update last login
    await db().execute({
      sql: `UPDATE vendors SET status = 'active' WHERE id = ?`,
      args: [String(vendor.id)],
    });

    const token = createVendorSession(String(vendor.id));

    const response = NextResponse.json({
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
    });

    response.cookies.set(VENDOR_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: MAX_AGE,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (error) {
    console.error('Vendor login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
