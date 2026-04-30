import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const status = url.searchParams.get('status'); // 'scheduled' | 'sent' | 'all'
  const donorId = url.searchParams.get('donor_id');

  let where = 'e.owner_id = ?';
  const args: (string | number)[] = [session.ownerId];

  if (status === 'scheduled') where += " AND e.status = 'scheduled'";
  else if (status === 'sent') where += " AND e.status = 'sent'";
  if (donorId) {
    where += ' AND e.donor_id = ?';
    args.push(donorId);
  }

  const result = await db().execute({
    sql: `SELECT e.*,
                 d.first_name, d.last_name
          FROM fr_email_queue e
          LEFT JOIN fr_donors d ON d.id = e.donor_id
          WHERE ${where}
          ORDER BY e.send_at ASC
          LIMIT 200`,
    args,
  });

  return NextResponse.json(
    result.rows.map((r) => ({
      ...r,
      donor_name: r.first_name ? `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}` : null,
    })),
  );
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const body = await request.json();
  const subject = (body.subject || '').trim();
  const bodyText = (body.body || '').trim();
  const toEmail = (body.to_email || '').trim();
  const sendAt = body.send_at;

  if (!subject || !bodyText || !toEmail || !sendAt) {
    return NextResponse.json({ error: 'subject, body, to_email, send_at all required' }, { status: 400 });
  }

  if (body.donor_id) {
    const access = await ensureDonorAccess(String(body.donor_id), session);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const id = crypto.randomUUID();
  await db().execute({
    sql: `INSERT INTO fr_email_queue
            (id, owner_id, donor_id, project_id, to_email, cc, subject, body, send_at, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
    args: [
      id,
      session.ownerId,
      body.donor_id || null,
      body.project_id || null,
      toEmail,
      body.cc || null,
      subject,
      bodyText,
      sendAt,
      session.actorId,
    ],
  });

  return NextResponse.json({ id });
}
