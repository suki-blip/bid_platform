import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import {
  FOLLOWUP_KINDS,
  FOLLOWUP_PRIORITIES,
  inEnum,
  isIsoDate,
} from '@/lib/fundraising-types';
import { refreshDonorNextFollowup } from '@/lib/fundraising-totals';

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const from = url.searchParams.get('from'); // ISO date
  const to = url.searchParams.get('to');
  const donorId = url.searchParams.get('donor_id');
  const status = url.searchParams.get('status'); // 'pending' | 'done' | 'all'

  let where = 'f.owner_id = ?';
  const args: (string | number)[] = [session.ownerId];

  if (session.role === 'fundraiser') {
    where += ' AND (f.fundraiser_id = ? OR f.fundraiser_id IS NULL)';
    args.push(session.fundraiserId!);
  }
  if (from) {
    where += ' AND f.due_at >= ?';
    args.push(from);
  }
  if (to) {
    where += ' AND f.due_at < ?';
    args.push(to);
  }
  if (donorId) {
    where += ' AND f.donor_id = ?';
    args.push(donorId);
  }
  if (status === 'pending') {
    where += " AND f.status = 'pending'";
  } else if (status === 'done') {
    where += " AND f.status = 'done'";
  }

  const rows = await db().execute({
    sql: `SELECT f.*,
                 d.first_name AS donor_first, d.last_name AS donor_last, d.hebrew_name AS donor_hebrew,
                 prj.name AS project_name,
                 tm.name AS fundraiser_name
          FROM fr_followups f
          LEFT JOIN fr_donors d ON d.id = f.donor_id
          LEFT JOIN fr_projects prj ON prj.id = f.project_id
          LEFT JOIN team_members tm ON tm.id = f.fundraiser_id
          WHERE ${where}
          ORDER BY f.due_at ASC
          LIMIT 500`,
    args,
  });

  return NextResponse.json(
    rows.rows.map((r) => ({
      ...r,
      donor_name: r.donor_first ? `${r.donor_first}${r.donor_last ? ' ' + r.donor_last : ''}` : null,
    })),
  );
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const body = await request.json();
  const title = (body.title || '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!body.due_at || !isIsoDate(body.due_at)) {
    return NextResponse.json({ error: 'due_at must be a valid ISO date' }, { status: 400 });
  }
  if ('end_at' in body && body.end_at && !isIsoDate(body.end_at)) {
    return NextResponse.json({ error: 'invalid end_at' }, { status: 400 });
  }
  if ('kind' in body && body.kind && !inEnum(FOLLOWUP_KINDS, body.kind)) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 });
  }
  if ('priority' in body && body.priority && !inEnum(FOLLOWUP_PRIORITIES, body.priority)) {
    return NextResponse.json({ error: 'invalid priority' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO fr_followups
            (id, owner_id, donor_id, project_id, fundraiser_id, title, description,
             due_at, end_at, kind, priority, status, hebrew_date, remind_minutes_before)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    args: [
      id,
      session.ownerId,
      body.donor_id || null,
      body.project_id || null,
      body.fundraiser_id || session.fundraiserId,
      title,
      body.description || null,
      body.due_at,
      body.end_at || null,
      body.kind || 'task',
      body.priority || 'normal',
      body.hebrew_date || null,
      body.remind_minutes_before ? Number(body.remind_minutes_before) : null,
    ],
  });

  if (body.donor_id) await refreshDonorNextFollowup(String(body.donor_id));

  return NextResponse.json({ id });
}
