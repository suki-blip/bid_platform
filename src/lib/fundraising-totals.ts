import { db } from './db';

export async function recomputeDonorTotals(donorId: string): Promise<void> {
  // total_pledged ignores synthetic "standalone" pledges (is_standalone=1) — those are
  // wrappers around free donations, not real commitments. total_paid still counts every
  // paid payment regardless of pledge type, because the money is real.
  const pledged = await db().execute({
    sql: `SELECT COALESCE(SUM(amount), 0) AS amt
          FROM fr_pledges
          WHERE donor_id = ? AND status IN ('open','fulfilled') AND COALESCE(is_standalone, 0) = 0`,
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

// Auto-promote a lead → donor when their first pledge / payment is recorded. Idempotent:
// donors already at status='donor' (or any non-prospect status) are left untouched. We use
// COALESCE on converted_at so re-promoting doesn't reset the timestamp if it was set
// earlier (e.g. manually via the /convert endpoint).
//
// Called from every code path that creates a pledge or a successful payment so the user
// never has to manually flip the status — recording a real commitment IS the moment of
// conversion. Returns true when an actual promotion happened so the caller can log it.
export async function promoteDonorIfNeeded(donorId: string): Promise<boolean> {
  const result = await db().execute({
    sql: `UPDATE fr_donors
          SET status = 'donor',
              converted_at = COALESCE(converted_at, datetime('now'))
          WHERE id = ? AND status = 'prospect'`,
    args: [donorId],
  });
  return Number(result.rowsAffected ?? 0) > 0;
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

// Generate due-dates for a multi-installment pledge.
//
// startDate    — ISO YYYY-MM-DD of the FIRST installment (also drives day-of-month /
//                day-of-week when paymentDay is null).
// count        — number of installments.
// plan         — cadence. 'weekly' adds 7 days; 'monthly' adds 1 month; 'quarterly' = 3
//                months; 'annual' = 12 months. 'lump_sum' / 'custom' return [startDate].
// paymentDay   — optional override. For monthly/quarterly/annual: day-of-month (1-31);
//                if the target month has fewer days (e.g. 31 in Feb), we clamp to month
//                end. For weekly: day-of-week (0=Sun, 6=Sat); the first installment shifts
//                forward to the next matching weekday, then we step by 7 days.
export function generateInstallmentDates(
  startDate: string,
  count: number,
  plan: 'lump_sum' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom',
  paymentDay?: number | null,
): string[] {
  if (plan === 'lump_sum' || plan === 'custom' || count <= 1) return [startDate];

  const start = new Date(startDate + 'T00:00:00');
  const dates: string[] = [];

  if (plan === 'weekly') {
    // If a day-of-week is supplied, shift `start` forward to the next matching day.
    if (paymentDay != null && paymentDay >= 0 && paymentDay <= 6) {
      const currentDow = start.getDay();
      const delta = (paymentDay - currentDow + 7) % 7;
      start.setDate(start.getDate() + delta);
    }
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 7);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  const monthsBetween = plan === 'monthly' ? 1 : plan === 'quarterly' ? 3 : 12;
  // Anchor to either the user-chosen day-of-month or startDate's own day.
  const anchorDay = paymentDay && paymentDay >= 1 && paymentDay <= 31 ? paymentDay : start.getDate();

  for (let i = 0; i < count; i++) {
    // Build the target year+month by adding monthsBetween * i to the start.
    const year = start.getFullYear();
    const monthIdx = start.getMonth() + i * monthsBetween;
    // Last day of target month (Date(y, m+1, 0) = last day of month m).
    const lastDay = new Date(year, monthIdx + 1, 0).getDate();
    const day = Math.min(anchorDay, lastDay);
    const d = new Date(year, monthIdx, day);
    // toISOString in UTC can roll back a day if the local TZ is ahead of UTC — build the
    // string manually from local-time fields to avoid that.
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}
