import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getContractorSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getContractorSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await dbReady();
    const client = db();

    // Get user info
    const userResult = await client.execute({
      sql: 'SELECT id, name, company, email, status, payment, plan, joined, stripe_customer_id, stripe_subscription_id FROM saas_users WHERE id = ?',
      args: [session.userId],
    });

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userResult.rows[0];

    // Get payment history
    const paymentsResult = await client.execute({
      sql: 'SELECT * FROM payments WHERE user_id = ? ORDER BY date DESC LIMIT 50',
      args: [session.userId],
    });

    // Calculate totals
    const totalPaid = await client.execute({
      sql: "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE user_id = ? AND status = 'paid'",
      args: [session.userId],
    });

    // Next payment date (last payment + 30 days)
    const lastPayment = await client.execute({
      sql: "SELECT date FROM payments WHERE user_id = ? AND status = 'paid' ORDER BY date DESC LIMIT 1",
      args: [session.userId],
    });

    let nextPaymentDate = null;
    if (lastPayment.rows.length > 0) {
      const lastDate = new Date(lastPayment.rows[0].date as string);
      lastDate.setDate(lastDate.getDate() + 30);
      nextPaymentDate = lastDate.toISOString();
    }

    return NextResponse.json({
      user,
      payments: paymentsResult.rows,
      totalPaid: Number(totalPaid.rows[0].total),
      nextPaymentDate,
    });
  } catch (error) {
    console.error('Billing error:', error);
    return NextResponse.json({ error: 'Failed to load billing' }, { status: 500 });
  }
}
