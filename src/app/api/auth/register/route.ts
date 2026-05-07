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

    // Log activity — admin will see this in the activity feed and can approve from /admin-panel/.../users
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'signup', `${name} (${email}) — awaiting approval`],
    });

    // Do NOT issue a session cookie — account is pending admin approval.
    // The UI shows a "pending" message and the user cannot enter the app until status flips to 'active' or 'trial'.
    return NextResponse.json({
      pending: true,
      message: 'Your account has been created and is awaiting admin approval. You will be notified once it is approved.',
    }, { status: 202 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
