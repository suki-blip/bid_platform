import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

interface CalendarEvent {
  id: string;
  type: 'followup' | 'payment_due' | 'birthday' | 'anniversary' | 'yahrzeit';
  date: string;
  time: string | null;
  title: string;
  donor_id: string | null;
  donor_name: string | null;
  status: string | null;
  priority: string | null;
  amount: number | null;
  method: string | null;
  project_name: string | null;
  followup_kind: string | null;
}

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to dates required' }, { status: 400 });
  }

  const events: CalendarEvent[] = [];

  // Followups
  const fundraiserFollowupFilter = session.role === 'fundraiser' ? ' AND (f.fundraiser_id = ? OR f.fundraiser_id IS NULL)' : '';
  const followupArgs = session.role === 'fundraiser'
    ? [session.ownerId, from, to, session.fundraiserId!]
    : [session.ownerId, from, to];

  const followupRes = await db().execute({
    sql: `SELECT f.id, f.title, f.due_at, f.kind, f.priority, f.status,
                 f.donor_id,
                 d.first_name, d.last_name,
                 prj.name AS project_name
          FROM fr_followups f
          LEFT JOIN fr_donors d ON d.id = f.donor_id
          LEFT JOIN fr_projects prj ON prj.id = f.project_id
          WHERE f.owner_id = ? AND f.due_at >= ? AND f.due_at < ?${fundraiserFollowupFilter}`,
    args: followupArgs,
  });
  for (const r of followupRes.rows) {
    const dueAt = String(r.due_at);
    const isoDate = dueAt.slice(0, 10);
    const time = dueAt.includes('T') || dueAt.includes(' ') ? dueAt.slice(11, 16) : null;
    events.push({
      id: `followup:${r.id}`,
      type: 'followup',
      date: isoDate,
      time,
      title: String(r.title),
      donor_id: r.donor_id ? String(r.donor_id) : null,
      donor_name: r.first_name ? `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}` : null,
      status: String(r.status),
      priority: String(r.priority),
      amount: null,
      method: null,
      project_name: r.project_name ? String(r.project_name) : null,
      followup_kind: String(r.kind),
    });
  }

  // Payment due dates (scheduled payments only)
  const fundraiserPaymentFilter = session.role === 'fundraiser' ? ' AND d.assigned_to = ?' : '';
  const paymentArgs = session.role === 'fundraiser'
    ? [session.ownerId, from, to, session.fundraiserId!]
    : [session.ownerId, from, to];

  const paymentRes = await db().execute({
    sql: `SELECT pp.id, pp.amount, pp.method, pp.status, pp.due_date, pp.installment_number,
                 d.id AS donor_id, d.first_name, d.last_name,
                 prj.name AS project_name
          FROM fr_pledge_payments pp
          JOIN fr_donors d ON d.id = pp.donor_id
          LEFT JOIN fr_projects prj ON prj.id = pp.project_id
          WHERE d.owner_id = ? AND pp.due_date >= ? AND pp.due_date < ?
            AND pp.status IN ('scheduled','bounced','failed')${fundraiserPaymentFilter}`,
    args: paymentArgs,
  });
  for (const r of paymentRes.rows) {
    events.push({
      id: `payment:${r.id}`,
      type: 'payment_due',
      date: String(r.due_date),
      time: null,
      title: `Payment due (${String(r.method).replace('_', ' ')})`,
      donor_id: String(r.donor_id),
      donor_name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
      status: String(r.status),
      priority: null,
      amount: Number(r.amount),
      method: String(r.method),
      project_name: r.project_name ? String(r.project_name) : null,
      followup_kind: null,
    });
  }

  // Birthdays / anniversaries / yahrzeit (recurring annually — match month/day)
  // Use SQL substr on the date field. Need to expand year range.
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const fundraiserDonorFilter = session.role === 'fundraiser' ? ' AND assigned_to = ?' : '';
  const donorArgs = session.role === 'fundraiser' ? [session.ownerId, session.fundraiserId!] : [session.ownerId];

  const milestoneRes = await db().execute({
    sql: `SELECT id, first_name, last_name, birthday, anniversary, yahrzeit
          FROM fr_donors
          WHERE owner_id = ? AND (birthday IS NOT NULL OR anniversary IS NOT NULL OR yahrzeit IS NOT NULL)${fundraiserDonorFilter}`,
    args: donorArgs,
  });

  for (const r of milestoneRes.rows) {
    const name = `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`;
    for (let yr = fromYear; yr <= toYear; yr++) {
      if (r.birthday) {
        const md = String(r.birthday).slice(5, 10); // MM-DD
        if (md && md.length === 5) {
          const date = `${yr}-${md}`;
          if (date >= from && date < to) {
            events.push({
              id: `birthday:${r.id}:${yr}`,
              type: 'birthday',
              date,
              time: null,
              title: `${name}'s birthday`,
              donor_id: String(r.id),
              donor_name: name,
              status: null,
              priority: null,
              amount: null,
              method: null,
              project_name: null,
              followup_kind: null,
            });
          }
        }
      }
      if (r.anniversary) {
        const md = String(r.anniversary).slice(5, 10);
        if (md && md.length === 5) {
          const date = `${yr}-${md}`;
          if (date >= from && date < to) {
            events.push({
              id: `anniversary:${r.id}:${yr}`,
              type: 'anniversary',
              date,
              time: null,
              title: `${name}'s anniversary`,
              donor_id: String(r.id),
              donor_name: name,
              status: null,
              priority: null,
              amount: null,
              method: null,
              project_name: null,
              followup_kind: null,
            });
          }
        }
      }
    }
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '').localeCompare(b.time || '')));

  return NextResponse.json({ events });
}
