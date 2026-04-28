import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    await dbReady();
    const client = db();
    const { name, company, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const id = crypto.randomUUID();

    try {
      await client.execute({
        sql: 'INSERT INTO saas_users (id, name, company, email, password_hash, status, payment, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, name, company || null, email.toLowerCase().trim(), passwordHash, 'pending', 'unpaid', 'Free'],
      });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
      }
      throw e;
    }

    // Log activity
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'signup', `${name} — new account registered (Pending)`],
    });

    // Auto-login: create session
    const token = crypto.randomBytes(32).toString('hex');
    const sessionData = JSON.stringify({
      userId: id,
      email: email.toLowerCase().trim(),
      name,
      company: company || null,
      plan: 'Free',
      token,
    });
    const encoded = Buffer.from(sessionData).toString('base64');

    const response = NextResponse.json({
      id,
      name,
      email: email.toLowerCase().trim(),
      company: company || null,
      plan: 'Free',
      status: 'pending',
      payment: 'unpaid',
    }, { status: 201 });

    response.cookies.set('contractor-auth', encoded, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
