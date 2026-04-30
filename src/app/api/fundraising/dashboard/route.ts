import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { fromGregorian, toIso } from '@/lib/hebrew-date';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const ownerId = session.ownerId;
  const isFundraiser = session.role === 'fundraiser';
  const fundraiserFilter = isFundraiser ? ' AND assigned_to = ?' : '';
  const fundraiserArgs = isFundraiser ? [session.fundraiserId!] : [];
  const pledgeFundraiserFilter = isFundraiser ? ' AND p.fundraiser_id = ?' : '';
  const pledgeFrArgs = isFundraiser ? [session.fundraiserId!] : [];
  const paymentFundraiserJoin = isFundraiser ? ' AND d.assigned_to = ?' : '';
  const paymentFrArgs = isFundraiser ? [session.fundraiserId!] : [];
  const followupFundraiserFilter = isFundraiser ? ' AND (f.fundraiser_id = ? OR f.fundraiser_id IS NULL)' : '';
  const followupFrArgs = isFundraiser ? [session.fundraiserId!] : [];

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = toIso(monthStart);
  const todayIso = toIso(new Date());

  const [prospects, donors, activeProjects, openPledges, paidThisMonth, overdue, followupsRes, recentRes] =
    await Promise.all([
      db().execute({
        sql: `SELECT COUNT(*) AS c FROM fr_donors WHERE owner_id = ? AND status = 'prospect'${fundraiserFilter}`,
        args: [ownerId, ...fundraiserArgs],
      }),
      db().execute({
        sql: `SELECT COUNT(*) AS c FROM fr_donors WHERE owner_id = ? AND status = 'donor'${fundraiserFilter}`,
        args: [ownerId, ...fundraiserArgs],
      }),
      db().execute({
        sql: `SELECT COUNT(*) AS c FROM fr_projects WHERE owner_id = ? AND status = 'active'`,
        args: [ownerId],
      }),
      db().execute({
        sql: `SELECT COALESCE(SUM(p.amount - COALESCE(paid.total,0)), 0) AS amt, COUNT(*) AS cnt
              FROM fr_pledges p
              LEFT JOIN (
                SELECT pledge_id, SUM(amount) AS total FROM fr_pledge_payments WHERE status = 'paid' GROUP BY pledge_id
              ) paid ON paid.pledge_id = p.id
              WHERE p.owner_id = ? AND p.status = 'open'${pledgeFundraiserFilter}`,
        args: [ownerId, ...pledgeFrArgs],
      }),
      db().execute({
        sql: `SELECT COALESCE(SUM(pp.amount), 0) AS amt
              FROM fr_pledge_payments pp
              JOIN fr_donors d ON d.id = pp.donor_id
              WHERE d.owner_id = ? AND pp.status = 'paid' AND pp.paid_date >= ?${paymentFundraiserJoin}`,
        args: [ownerId, monthStartIso, ...paymentFrArgs],
      }),
      db().execute({
        sql: `SELECT COALESCE(SUM(pp.amount), 0) AS amt, COUNT(*) AS cnt
              FROM fr_pledge_payments pp
              JOIN fr_donors d ON d.id = pp.donor_id
              WHERE d.owner_id = ? AND pp.status IN ('scheduled','bounced','failed') AND pp.due_date IS NOT NULL AND pp.due_date < ?${paymentFundraiserJoin}`,
        args: [ownerId, todayIso, ...paymentFrArgs],
      }),
      db().execute({
        sql: `SELECT f.id, f.title, f.due_at, f.kind, f.priority,
                     COALESCE(d.first_name || ' ' || COALESCE(d.last_name,''), NULL) AS donor_name
              FROM fr_followups f
              LEFT JOIN fr_donors d ON d.id = f.donor_id
              WHERE f.owner_id = ? AND f.status = 'pending' AND f.due_at >= datetime('now', '-1 day')${followupFundraiserFilter}
              ORDER BY f.due_at ASC
              LIMIT 6`,
        args: [ownerId, ...followupFrArgs],
      }),
      db().execute({
        sql: `SELECT pp.id, pp.amount, pp.paid_date, pp.method,
                     (d.first_name || ' ' || COALESCE(d.last_name,'')) AS donor_name,
                     prj.name AS project_name
              FROM fr_pledge_payments pp
              JOIN fr_donors d ON d.id = pp.donor_id
              LEFT JOIN fr_projects prj ON prj.id = pp.project_id
              WHERE d.owner_id = ? AND pp.status = 'paid'${paymentFundraiserJoin}
              ORDER BY pp.paid_date DESC
              LIMIT 6`,
        args: [ownerId, ...paymentFrArgs],
      }),
    ]);

  const today = fromGregorian(new Date());

  return NextResponse.json({
    stats: {
      prospects: Number(prospects.rows[0]?.c || 0),
      donors: Number(donors.rows[0]?.c || 0),
      activeProjects: Number(activeProjects.rows[0]?.c || 0),
      pledgesOpenAmount: Number(openPledges.rows[0]?.amt || 0),
      pledgesOpenCount: Number(openPledges.rows[0]?.cnt || 0),
      paidThisMonthAmount: Number(paidThisMonth.rows[0]?.amt || 0),
      overdueCount: Number(overdue.rows[0]?.cnt || 0),
      overdueAmount: Number(overdue.rows[0]?.amt || 0),
    },
    today: {
      iso: today.iso,
      gregorian: today.gregorian,
      hebrew: today.hebrew,
      hebrewEn: today.hebrewEn,
      dayOfWeek: today.dayOfWeek,
      holidays: today.holidays,
    },
    upcomingFollowups: followupsRes.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      due_at: String(r.due_at),
      kind: String(r.kind),
      priority: String(r.priority),
      donor_name: r.donor_name ? String(r.donor_name).trim() : null,
    })),
    recentDonations: recentRes.rows.map((r) => ({
      id: String(r.id),
      donor_name: String(r.donor_name).trim(),
      amount: Number(r.amount),
      paid_date: String(r.paid_date),
      method: String(r.method),
      project_name: r.project_name ? String(r.project_name) : null,
    })),
  });
}
