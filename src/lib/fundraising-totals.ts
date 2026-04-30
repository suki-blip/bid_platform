import { db } from './db';

export async function recomputeDonorTotals(donorId: string): Promise<void> {
  const pledged = await db().execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS amt FROM fr_pledges WHERE donor_id = ? AND status IN ('open','fulfilled')`,
    args: [donorId],
  });
  const paid = await db().execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS amt FROM fr_pledge_payments WHERE donor_id = ? AND status = 'paid'`,
    args: [donorId],
  });
  await db().execute({
    sql: 'UPDATE fr_donors SET total_pledged = ?, total_paid = ?, lifetime_value = ? WHERE id = ?',
    args: [Number(pledged.rows[0].amt), Number(paid.rows[0].amt), Number(paid.rows[0].amt), donorId],
  });
}

export async function recomputePledgeStatus(pledgeId: string): Promise<void> {
  const pledgeRes = await db().execute({
    sql: 'SELECT amount, status FROM fr_pledges WHERE id = ?',
    args: [pledgeId],
  });
  const pledge = pledgeRes.rows[0];
  if (!pledge) return;
  if (pledge.status === 'cancelled') return;

  const paidRes = await db().execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS amt FROM fr_pledge_payments WHERE pledge_id = ? AND status = 'paid'`,
    args: [pledgeId],
  });
  const paid = Number(paidRes.rows[0].amt);
  const amount = Number(pledge.amount);
  const newStatus = paid >= amount ? 'fulfilled' : 'open';
  await db().execute({
    sql: 'UPDATE fr_pledges SET status = ? WHERE id = ?',
    args: [newStatus, pledgeId],
  });
}

export async function refreshDonorNextFollowup(donorId: string): Promise<void> {
  await db().execute({
    sql: `UPDATE fr_donors
          SET next_followup_at = (
            SELECT MIN(due_at) FROM fr_followups
            WHERE donor_id = ? AND status = 'pending'
          )
          WHERE id = ?`,
    args: [donorId, donorId],
  });
}

export function generateInstallmentDates(
  startDate: string,
  count: number,
  plan: 'lump_sum' | 'monthly' | 'quarterly' | 'annual' | 'custom',
): string[] {
  if (plan === 'lump_sum' || count <= 1) return [startDate];

  const monthsBetween = plan === 'monthly' ? 1 : plan === 'quarterly' ? 3 : plan === 'annual' ? 12 : 1;
  const start = new Date(startDate);
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i * monthsBetween);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
