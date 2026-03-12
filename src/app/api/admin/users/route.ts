import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';

export async function GET(request: NextRequest) {
  await dbReady();
  const client = db();
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || '50');
  const offset = Number(url.searchParams.get('offset') || '0');
  const search = url.searchParams.get('search') || '';
  const filter = url.searchParams.get('filter') || 'all';

  let where = '';
  const args: any[] = [];

  if (search) {
    where += " AND (name LIKE ? OR email LIKE ?)";
    args.push(`%${search}%`, `%${search}%`);
  }

  if (filter === 'active') { where += " AND status = 'active'"; }
  else if (filter === 'trial') { where += " AND status = 'trial'"; }
  else if (filter === 'suspended') { where += " AND status = 'suspended'"; }
  else if (filter === 'unpaid') { where += " AND payment = 'unpaid'"; }

  const result = await client.execute({
    sql: `SELECT id, name, company, email, status, payment, plan, joined, last_login FROM saas_users WHERE 1=1 ${where} ORDER BY joined DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  const total = await client.execute({
    sql: `SELECT COUNT(*) as count FROM saas_users WHERE 1=1 ${where}`,
    args,
  });

  return NextResponse.json({
    users: result.rows,
    total: Number(total.rows[0].count),
  });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const client = db();
  const body = await request.json();
  const { name, company, email, password, plan } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
  }

  const pwdCheck = validatePassword(password);
  if (!pwdCheck.valid) {
    return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();
  const status = plan === 'Pro' ? 'active' : 'trial';
  const payment = plan === 'Pro' ? 'paid' : 'trial';
  const planName = plan === 'Pro' ? 'Pro' : 'Trial';

  try {
    await client.execute({
      sql: 'INSERT INTO saas_users (id, name, company, email, password_hash, status, payment, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, name, company || null, email, passwordHash, status, payment, planName],
    });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    throw e;
  }

  // Log activity
  await client.execute({
    sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
    args: [crypto.randomUUID(), 'signup', `${name} — new account created (${planName})`],
  });

  return NextResponse.json({ id, name, email, status, payment, plan: planName }, { status: 201 });
}
