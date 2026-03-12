import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  await dbReady();
  const client = db();
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || '50');
  const offset = Number(url.searchParams.get('offset') || '0');

  const result = await client.execute({
    sql: `SELECT p.*, u.name, u.email FROM payments p
      JOIN saas_users u ON u.id = p.user_id
      ORDER BY p.date DESC LIMIT ? OFFSET ?`,
    args: [limit, offset],
  });

  const total = await client.execute('SELECT COUNT(*) as count FROM payments');

  // KPIs
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const mrr = await client.execute({
    sql: "SELECT COALESCE(SUM(amount), 0) as mrr FROM payments WHERE status = 'paid' AND date >= ?",
    args: [monthStart],
  });
  const failed = await client.execute("SELECT COALESCE(SUM(amount), 0) as failed FROM payments WHERE status = 'failed'");
  const paying = await client.execute("SELECT COUNT(*) as count FROM saas_users WHERE payment = 'paid'");

  return NextResponse.json({
    payments: result.rows,
    total: Number(total.rows[0].count),
    monthRevenue: Number(mrr.rows[0].mrr),
    failedAmount: Number(failed.rows[0].failed),
    payingUsers: Number(paying.rows[0].count),
  });
}

export async function POST(request: NextRequest) {
  await dbReady();
  const client = db();
  const body = await request.json();
  const { user_id, amount, status } = body;

  if (!user_id || !amount) {
    return NextResponse.json({ error: 'user_id and amount are required' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await client.execute({
    sql: 'INSERT INTO payments (id, user_id, amount, status) VALUES (?, ?, ?, ?)',
    args: [id, user_id, amount, status || 'paid'],
  });

  // Update user payment status
  const user = await client.execute({ sql: 'SELECT name FROM saas_users WHERE id = ?', args: [user_id] });
  const userName = user.rows.length ? (user.rows[0] as any).name : 'Unknown';

  if (status === 'failed') {
    await client.execute({ sql: "UPDATE saas_users SET payment = 'unpaid' WHERE id = ?", args: [user_id] });
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'failed', `${userName} — payment failed`],
    });
  } else {
    await client.execute({ sql: "UPDATE saas_users SET payment = 'paid' WHERE id = ?", args: [user_id] });
    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'payment', `${userName} — payment received $${amount}`],
    });
  }

  return NextResponse.json({ id }, { status: 201 });
}
