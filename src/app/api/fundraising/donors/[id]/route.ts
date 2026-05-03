import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

async function loadDonorScoped(donorId: string, ownerId: string, fundraiserId: string | null) {
  const sql = fundraiserId
    ? 'SELECT * FROM fr_donors WHERE id = ? AND owner_id = ? AND assigned_to = ?'
    : 'SELECT * FROM fr_donors WHERE id = ? AND owner_id = ?';
  const args = fundraiserId ? [donorId, ownerId, fundraiserId] : [donorId, ownerId];
  const r = await db().execute({ sql, args });
  return r.rows[0] || null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const donor = await loadDonorScoped(id, session.ownerId, session.role === 'fundraiser' ? session.fundraiserId : null);
  if (!donor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [phones, addresses, calls, notes, pledges, payments, source, assigned] = await Promise.all([
    db().execute({
      sql: 'SELECT * FROM fr_donor_phones WHERE donor_id = ? ORDER BY is_primary DESC, sort_order ASC',
      args: [id],
    }),
    db().execute({
      sql: 'SELECT * FROM fr_donor_addresses WHERE donor_id = ? ORDER BY is_primary DESC, sort_order ASC',
      args: [id],
    }),
    db().execute({
      sql: `SELECT c.*, tm.name AS fundraiser_name, p.name AS project_name
            FROM fr_calls c
            LEFT JOIN team_members tm ON tm.id = c.fundraiser_id
            LEFT JOIN fr_projects p ON p.id = c.project_id
            WHERE c.donor_id = ?
            ORDER BY c.occurred_at DESC`,
      args: [id],
    }),
    db().execute({
      sql: 'SELECT * FROM fr_notes WHERE donor_id = ? ORDER BY pinned DESC, created_at DESC',
      args: [id],
    }),
    db().execute({
      sql: `SELECT pl.*, p.name AS project_name,
                   COALESCE((SELECT SUM(amount) FROM fr_pledge_payments WHERE pledge_id = pl.id AND status = 'paid'), 0) AS paid_amount
            FROM fr_pledges pl
            LEFT JOIN fr_projects p ON p.id = pl.project_id
            WHERE pl.donor_id = ?
            ORDER BY pl.pledge_date DESC`,
      args: [id],
    }),
    db().execute({
      sql: `SELECT pp.*, p.name AS project_name
            FROM fr_pledge_payments pp
            LEFT JOIN fr_projects p ON p.id = pp.project_id
            WHERE pp.donor_id = ?
            ORDER BY COALESCE(pp.paid_date, pp.due_date, pp.created_at) DESC`,
      args: [id],
    }),
    donor.source_id
      ? db().execute({ sql: 'SELECT id, name FROM fr_sources WHERE id = ?', args: [String(donor.source_id)] })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    donor.assigned_to
      ? db().execute({
          sql: 'SELECT id, name, email FROM team_members WHERE id = ?',
          args: [String(donor.assigned_to)],
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  return NextResponse.json({
    donor: {
      ...donor,
      tags: (() => {
        try {
          return JSON.parse(String(donor.tags || '[]')) as string[];
        } catch {
          return [];
        }
      })(),
      do_not_contact: Number(donor.do_not_contact || 0) === 1,
      source: source.rows[0] || null,
      assigned: assigned.rows[0] || null,
    },
    phones: phones.rows,
    addresses: addresses.rows,
    calls: calls.rows,
    notes: notes.rows,
    pledges: pledges.rows,
    payments: payments.rows,
  });
}

const EDITABLE_FIELDS = [
  'first_name',
  'last_name',
  'hebrew_name',
  'title',
  'spouse_name',
  'email',
  'organization',
  'occupation',
  'birthday',
  'yahrzeit',
  'anniversary',
  'source_id',
  'source_notes',
  'preferred_contact',
  'notes',
] as const;

const RATING_FIELDS = ['financial_rating', 'giving_rating'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const donor = await loadDonorScoped(id, session.ownerId, session.role === 'fundraiser' ? session.fundraiserId : null);
  if (!donor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      sets.push(`${field} = ?`);
      args.push(body[field] === '' ? null : body[field] ?? null);
    }
  }
  for (const field of RATING_FIELDS) {
    if (field in body) {
      const v = body[field];
      if (v === null || v === '') {
        sets.push(`${field} = NULL`);
      } else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          return NextResponse.json({ error: `${field} must be an integer 1-5` }, { status: 400 });
        }
        sets.push(`${field} = ?`);
        args.push(n);
      }
    }
  }
  if ('tags' in body) {
    sets.push('tags = ?');
    args.push(JSON.stringify(Array.isArray(body.tags) ? body.tags : []));
  }
  if ('do_not_contact' in body) {
    sets.push('do_not_contact = ?');
    args.push(body.do_not_contact ? 1 : 0);
  }
  if (session.isManager && 'assigned_to' in body) {
    sets.push('assigned_to = ?');
    args.push(body.assigned_to || null);
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });

  args.push(id);
  await db().execute({ sql: `UPDATE fr_donors SET ${sets.join(', ')} WHERE id = ?`, args });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Only managers can delete donors' }, { status: 403 });
  await dbReady();
  const { id } = await params;

  await db().execute({
    sql: 'DELETE FROM fr_donors WHERE id = ? AND owner_id = ?',
    args: [id, session.ownerId],
  });
  return NextResponse.json({ ok: true });
}
