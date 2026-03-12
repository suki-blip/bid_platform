import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  await dbReady();
  const client = db();

  const monthStart = new Date().toISOString().slice(0, 7) + '-01';

  const [totalUsers, activePaying, unpaidCount, mrr, unpaidUsers, recentActivity] =
    await Promise.all([
      client.execute('SELECT COUNT(*) as count FROM saas_users'),
      client.execute("SELECT COUNT(*) as count FROM saas_users WHERE status = 'active' AND payment = 'paid'"),
      client.execute("SELECT COUNT(*) as count FROM saas_users WHERE payment = 'unpaid'"),
      client.execute({ sql: "SELECT COALESCE(SUM(amount), 0) as mrr FROM payments WHERE status = 'paid' AND date >= ?", args: [monthStart] }),
      client.execute("SELECT id, name, email, status, payment FROM saas_users WHERE payment = 'unpaid' ORDER BY joined DESC"),
      client.execute('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10'),
    ]);

  return NextResponse.json({
    totalUsers: Number(totalUsers.rows[0].count),
    activePaying: Number(activePaying.rows[0].count),
    unpaidCount: Number(unpaidCount.rows[0].count),
    mrr: Number(mrr.rows[0].mrr),
    unpaidUsers: unpaidUsers.rows,
    recentActivity: recentActivity.rows,
  });
}
