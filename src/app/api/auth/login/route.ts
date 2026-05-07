import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    await dbReady();
    const client = db();
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const result = await client.execute({
      sql: 'SELECT * FROM saas_users WHERE email = ?',
      args: [email.toLowerCase().trim()],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const user = result.rows[0] as any;

    // Validate password BEFORE revealing account status — prevents account-status oracle for unknown emails.
    const valid = await verifyPassword(password, user.password_hash as string);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Status gating: only 'active' accounts (or 'trial' with valid trial_end_date) can log in.
    if (user.status === 'pending') {
      return NextResponse.json({
        error: 'Your account is awaiting admin approval. You will receive an email once approved.',
        pending: true,
      }, { status: 403 });
    }
    if (user.status === 'suspended') {
      return NextResponse.json({ error: 'Your account has been suspended. Please contact support.' }, { status: 403 });
    }
    if (user.status === 'trial' && user.trial_end_date) {
      const trialEnd = new Date(String(user.trial_end_date));
      if (trialEnd.getTime() < Date.now()) {
        return NextResponse.json({ error: 'Your free trial has ended. Please contact support to continue.' }, { status: 403 });
      }
    }

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    const sessionData = JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      company: user.company,
      plan: user.plan,
      token,
    });
    const encoded = Buffer.from(sessionData).toString('base64');

    // Update last_login
    await client.execute({
      sql: "UPDATE saas_users SET last_login = datetime('now') WHERE id = ?",
      args: [user.id],
    });

    // Log activity
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'login', `${user.name} logged in`],
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
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
