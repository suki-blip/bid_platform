import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ donors: [], projects: [] });

  const like = `%${q}%`;
  const fundraiserFilter = session.role === 'fundraiser' ? ' AND assigned_to = ?' : '';
  const args: (string | number)[] = [session.ownerId, like, like, like, like, like];
  if (session.role === 'fundraiser') args.push(session.fundraiserId!);

  const donors = await db().execute({
    sql: `SELECT id, first_name, last_name, hebrew_name, email, organization, status, total_paid
          FROM fr_donors
          WHERE owner_id = ?
            AND (first_name LIKE ? OR last_name LIKE ? OR hebrew_name LIKE ? OR email LIKE ? OR organization LIKE ?)${fundraiserFilter}
          ORDER BY total_paid DESC, first_name
          LIMIT 8`,
    args,
  });

  const projects = await db().execute({
    sql: `SELECT id, name, status FROM fr_projects WHERE owner_id = ? AND name LIKE ? ORDER BY status = 'active' DESC LIMIT 5`,
    args: [session.ownerId, like],
  });

  return NextResponse.json({
    donors: donors.rows.map((d) => ({
      id: String(d.id),
      first_name: String(d.first_name),
      last_name: d.last_name ? String(d.last_name) : null,
      hebrew_name: d.hebrew_name ? String(d.hebrew_name) : null,
      organization: d.organization ? String(d.organization) : null,
      status: String(d.status),
      total_paid: Number(d.total_paid || 0),
    })),
    projects: projects.rows.map((p) => ({
      id: String(p.id),
      name: String(p.name),
      status: String(p.status),
    })),
  });
}
