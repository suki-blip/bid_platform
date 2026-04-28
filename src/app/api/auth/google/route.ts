import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    await dbReady();
    const client = db();
    const { credential } = await request.json();

    if (!credential) {
      return NextResponse.json({ error: 'Missing Google credential' }, { status: 400 });
    }

    // Decode the Google JWT token (it's a JWT with 3 parts)
    const parts = credential.split('.');
    if (parts.length !== 3) {
      return NextResponse.json({ error: 'Invalid credential format' }, { status: 400 });
    }

    // Decode payload (base64url)
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );

    const { sub: googleId, email, name, picture } = payload;

    if (!email || !googleId) {
      return NextResponse.json({ error: 'Invalid Google token' }, { status: 400 });
    }

    // Verify the token with Google
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!verifyRes.ok) {
      return NextResponse.json({ error: 'Google token verification failed' }, { status: 401 });
    }
    const verified = await verifyRes.json();

    // Check that the audience matches our client ID
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && verified.aud !== clientId) {
      return NextResponse.json({ error: 'Token audience mismatch' }, { status: 401 });
    }

    // Check if user exists by google_id or email
    let user: any = null;

    const byGoogle = await client.execute({
      sql: 'SELECT * FROM saas_users WHERE google_id = ?',
      args: [googleId],
    });
    if (byGoogle.rows.length > 0) {
      user = byGoogle.rows[0];
    }

    if (!user) {
      const byEmail = await client.execute({
        sql: 'SELECT * FROM saas_users WHERE email = ?',
        args: [email.toLowerCase().trim()],
      });
      if (byEmail.rows.length > 0) {
        user = byEmail.rows[0];
        // Link Google account to existing user
        await client.execute({
          sql: 'UPDATE saas_users SET google_id = ?, avatar_url = ? WHERE id = ?',
          args: [googleId, picture || null, user.id],
        });
      }
    }

    // Create new user if not found
    if (!user) {
      const id = crypto.randomUUID();
      // Create user without password (Google-only)
      const dummyHash = `google:${googleId}`;
      await client.execute({
        sql: 'INSERT INTO saas_users (id, name, email, password_hash, google_id, avatar_url, status, payment, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, name || email.split('@')[0], email.toLowerCase().trim(), dummyHash, googleId, picture || null, 'pending', 'unpaid', 'Free'],
      });

      await client.execute({
        sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
        args: [crypto.randomUUID(), 'signup', `${name || email} — new account via Google (Pending)`],
      });

      user = { id, name: name || email.split('@')[0], email: email.toLowerCase().trim(), company: null, plan: 'Free', status: 'pending', payment: 'unpaid' };
    }

    if (user.status === 'suspended') {
      return NextResponse.json({ error: 'Your account has been suspended.' }, { status: 403 });
    }

    // Create session
    const token = crypto.randomBytes(32).toString('hex');
    const sessionData = JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      company: user.company || null,
      plan: user.plan,
      token,
    });
    const encoded = Buffer.from(sessionData).toString('base64');

    // Update last_login
    await client.execute({
      sql: "UPDATE saas_users SET last_login = datetime('now') WHERE id = ?",
      args: [user.id],
    });

    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'login', `${user.name} logged in via Google`],
    });

    const response = NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      company: user.company,
      plan: user.plan,
      status: user.status,
      payment: user.payment,
    });

    response.cookies.set('contractor-auth', encoded, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Google auth error:', error);
    return NextResponse.json({ error: 'Google login failed' }, { status: 500 });
  }
}
