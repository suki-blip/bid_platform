import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    await dbReady();
    const client = db();
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Check admin_settings for admin email
    const settingsResult = await client.execute(
      "SELECT value FROM admin_settings WHERE key = 'admin_email'"
    );
    const adminEmail = settingsResult.rows.length > 0
      ? (settingsResult.rows[0].value as string)
      : 'admin@bidmaster.app';

    // Check admin password from settings or env
    const pwdResult = await client.execute(
      "SELECT value FROM admin_settings WHERE key = 'admin_password_hash'"
    );

    let authenticated = false;

    if (pwdResult.rows.length > 0 && pwdResult.rows[0].value) {
      // Verify against stored hashed password
      if (email.toLowerCase() === adminEmail.toLowerCase()) {
        authenticated = await verifyPassword(password, pwdResult.rows[0].value as string);
      }
    } else {
      // Fallback: check ADMIN_PASSWORD env var, or default for first-time setup
      const envPassword = process.env.ADMIN_PASSWORD || 'BidMaster2025!';
      if (email.toLowerCase() === adminEmail.toLowerCase() && password === envPassword) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Generate a session token with fixed prefix so middleware can recognize it
    const sessionToken = 'bidmaster-admin-' + crypto.randomUUID();
    const adminPath = process.env.ADMIN_SECRET_PATH || 'admin';

    // Log activity
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'admin', 'Admin logged in'],
    });

    const response = NextResponse.json({ ok: true, redirect: `/admin-panel/${adminPath}` });

    response.cookies.set('admin-auth', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    });

    return response;
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
