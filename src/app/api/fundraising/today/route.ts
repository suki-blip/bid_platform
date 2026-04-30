import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { fromGregorian, toIso } from '@/lib/hebrew-date';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const today = new Date();
  const todayIso = toIso(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toIso(tomorrow);

  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekIso = toIso(weekFromNow);

  const ownerId = session.ownerId;
  const isFundraiser = session.role === 'fundraiser';
  const monthDay = todayIso.slice(5, 10);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const [todayFollowups, overdueFollowups, overduePayments, todayBirthdays, yahrzeitsOnFile, emailsDueToday, stale] =
    await Promise.all([
      db().execute({
        sql: `SELECT f.id, f.title, f.due_at, f.kind, f.priority, f.donor_id,
                     d.first_name AS donor_first, d.last_name AS donor_last
              FROM fr_followups f
              LEFT JOIN fr_donors d ON d.id = f.donor_id
              WHERE f.owner_id = ?
                AND f.status = 'pending'
                AND f.due_at >= ?
                AND f.due_at < ?
                ${isFundraiser ? 'AND (f.fundraiser_id = ? OR f.fundraiser_id IS NULL)' : ''}
              ORDER BY f.due_at ASC`,
        args: isFundraiser
          ? [ownerId, `${todayIso}T00:00:00`, `${tomorrowIso}T00:00:00`, session.fundraiserId!]
          : [ownerId, `${todayIso}T00:00:00`, `${tomorrowIso}T00:00:00`],
      }),
      db().execute({
        sql: `SELECT f.id, f.title, f.due_at, f.kind, f.priority, f.donor_id,
                     d.first_name AS donor_first, d.last_name AS donor_last
              FROM fr_followups f
              LEFT JOIN fr_donors d ON d.id = f.donor_id
              WHERE f.owner_id = ?
                AND f.status = 'pending'
                AND f.due_at < ?
                ${isFundraiser ? 'AND (f.fundraiser_id = ? OR f.fundraiser_id IS NULL)' : ''}
              ORDER BY f.due_at ASC
              LIMIT 20`,
        args: isFundraiser
          ? [ownerId, `${todayIso}T00:00:00`, session.fundraiserId!]
          : [ownerId, `${todayIso}T00:00:00`],
      }),
      db().execute({
        sql: `SELECT pp.id, pp.amount, pp.method, pp.due_date, pp.installment_number, pp.status,
                     d.id AS donor_id, d.first_name, d.last_name,
                     (SELECT phone FROM fr_donor_phones WHERE donor_id = d.id ORDER BY is_primary DESC LIMIT 1) AS phone,
                     prj.name AS project_name
              FROM fr_pledge_payments pp
              JOIN fr_donors d ON d.id = pp.donor_id
              LEFT JOIN fr_projects prj ON prj.id = pp.project_id
              WHERE d.owner_id = ?
                AND pp.status IN ('scheduled','bounced','failed')
                AND pp.due_date IS NOT NULL
                AND pp.due_date < ?
                ${isFundraiser ? 'AND d.assigned_to = ?' : ''}
              ORDER BY pp.due_date ASC
              LIMIT 20`,
        args: isFundraiser ? [ownerId, todayIso, session.fundraiserId!] : [ownerId, todayIso],
      }),
      db().execute({
        sql: `SELECT id, first_name, last_name, hebrew_name, birthday
              FROM fr_donors
              WHERE owner_id = ?
                AND birthday IS NOT NULL
                AND substr(birthday, 6, 5) = ?
                ${isFundraiser ? 'AND assigned_to = ?' : ''}`,
        args: isFundraiser ? [ownerId, monthDay, session.fundraiserId!] : [ownerId, monthDay],
      }),
      // Yahrzeit field is free-text Hebrew date — recurrence isn't computable from this column alone,
      // so we just surface donors who have one on file. Renamed below to match.
      db().execute({
        sql: `SELECT id, first_name, last_name, yahrzeit
              FROM fr_donors
              WHERE owner_id = ?
                AND yahrzeit IS NOT NULL
                AND yahrzeit != ''
                ${isFundraiser ? 'AND assigned_to = ?' : ''}
              LIMIT 30`,
        args: isFundraiser ? [ownerId, session.fundraiserId!] : [ownerId],
      }),
      db().execute({
        sql: `SELECT e.id, e.subject, e.to_email, e.send_at, e.donor_id,
                     d.first_name AS donor_first, d.last_name AS donor_last
              FROM fr_email_queue e
              LEFT JOIN fr_donors d ON d.id = e.donor_id
              WHERE e.owner_id = ?
                AND e.status = 'scheduled'
                AND e.send_at < ?
              ORDER BY e.send_at ASC
              LIMIT 30`,
        args: [ownerId, `${tomorrowIso}T00:00:00`],
      }),
      db().execute({
        sql: `SELECT id, first_name, last_name, hebrew_name, total_paid, last_contact_at
              FROM fr_donors
              WHERE owner_id = ? AND status = 'donor' AND total_paid > 0
                AND (last_contact_at IS NULL OR last_contact_at < ?)
                ${isFundraiser ? 'AND assigned_to = ?' : ''}
              ORDER BY total_paid DESC
              LIMIT 6`,
        args: isFundraiser
          ? [ownerId, sixtyDaysAgo.toISOString(), session.fundraiserId!]
          : [ownerId, sixtyDaysAgo.toISOString()],
      }),
    ]);

  const todayInfo = fromGregorian(today);

  return NextResponse.json({
    today: {
      iso: todayIso,
      gregorian: todayInfo.gregorian,
      hebrew: todayInfo.hebrew,
      hebrewEn: todayInfo.hebrewEn,
      dayOfWeek: todayInfo.dayOfWeek,
      holidays: todayInfo.holidays,
    },
    horizons: { today: todayIso, tomorrow: tomorrowIso, week: weekIso },
    todayFollowups: todayFollowups.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      due_at: String(r.due_at),
      kind: String(r.kind),
      priority: String(r.priority),
      donor_id: r.donor_id ? String(r.donor_id) : null,
      donor_name: r.donor_first ? `${r.donor_first}${r.donor_last ? ' ' + r.donor_last : ''}` : null,
    })),
    overdueFollowups: overdueFollowups.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      due_at: String(r.due_at),
      kind: String(r.kind),
      priority: String(r.priority),
      donor_id: r.donor_id ? String(r.donor_id) : null,
      donor_name: r.donor_first ? `${r.donor_first}${r.donor_last ? ' ' + r.donor_last : ''}` : null,
    })),
    overduePayments: overduePayments.rows.map((r) => ({
      id: String(r.id),
      amount: Number(r.amount),
      method: String(r.method),
      due_date: String(r.due_date),
      installment_number: Number(r.installment_number),
      status: String(r.status),
      donor_id: String(r.donor_id),
      donor_name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
      phone: r.phone ? String(r.phone) : null,
      project_name: r.project_name ? String(r.project_name) : null,
    })),
    todayBirthdays: todayBirthdays.rows.map((r) => ({
      id: String(r.id),
      donor_name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
      hebrew_name: r.hebrew_name ? String(r.hebrew_name) : null,
      birthday: String(r.birthday),
    })),
    yahrzeitsThisWeek: yahrzeitsOnFile.rows.map((r) => ({
      id: String(r.id),
      donor_name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
      yahrzeit: String(r.yahrzeit),
    })),
    emailsDueToday: emailsDueToday.rows.map((r) => ({
      id: String(r.id),
      subject: String(r.subject),
      to_email: String(r.to_email),
      send_at: String(r.send_at),
      donor_id: r.donor_id ? String(r.donor_id) : null,
      donor_name: r.donor_first ? `${r.donor_first}${r.donor_last ? ' ' + r.donor_last : ''}` : null,
    })),
    staleDonors: stale.rows.map((r) => ({
      id: String(r.id),
      donor_name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
      hebrew_name: r.hebrew_name ? String(r.hebrew_name) : null,
      total_paid: Number(r.total_paid || 0),
      last_contact_at: r.last_contact_at ? String(r.last_contact_at) : null,
    })),
  });
}
