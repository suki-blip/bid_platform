import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

// Campaign prospects for a project. List + add.
//
// GET  → returns all prospects for the project (active only — soft-deleted entries can be
//        added later if needed). Joined with donor info (name, phone) for the call-list UI.
//
// POST → adds a prospect. Body: { donor_id, estimated_amount, notes?, status? }
//        Same donor cannot be added twice (UNIQUE constraint on project_id + donor_id) —
//        we return 409 on duplicate.

interface NewProspect {
  donor_id?: string;
  estimated_amount?: number;
  notes?: string;
  status?: string;
}

const VALID_STATUSES = new Set(['pending', 'called', 'confirmed', 'declined']);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id: projectId } = await params;

  // Verify project belongs to this owner (basic tenant guard).
  const proj = await db().execute({
    sql: 'SELECT id FROM fr_projects WHERE id = ?',
    args: [projectId],
  });
  if (proj.rows.length === 0) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const result = await db().execute({
    sql: `SELECT p.id, p.donor_id, p.estimated_amount, p.status, p.notes,
                 p.created_at, p.contacted_at,
                 d.first_name, d.last_name, d.hebrew_name, d.organization, d.status AS donor_status,
                 (SELECT phone FROM fr_donor_phones WHERE donor_id = d.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_phone
          FROM fr_project_prospects p
          JOIN fr_donors d ON d.id = p.donor_id
          WHERE p.project_id = ? AND p.owner_id = ?
          ORDER BY
            CASE p.status WHEN 'pending' THEN 0 WHEN 'called' THEN 1 WHEN 'confirmed' THEN 2 WHEN 'declined' THEN 3 ELSE 4 END,
            p.estimated_amount DESC`,
    args: [projectId, session.ownerId],
  });

  const prospects = result.rows.map((r) => ({
    id: r.id,
    donor_id: r.donor_id,
    donor_name: `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`.trim(),
    hebrew_name: r.hebrew_name,
    organization: r.organization,
    donor_status: r.donor_status,
    primary_phone: r.primary_phone,
    estimated_amount: Number(r.estimated_amount || 0),
    status: r.status,
    notes: r.notes,
    created_at: r.created_at,
    contacted_at: r.contacted_at,
  }));

  // Summary numbers — useful for the project page header.
  const summary = {
    total_count: prospects.length,
    total_estimated: prospects.reduce((s, p) => s + p.estimated_amount, 0),
    confirmed_count: prospects.filter((p) => p.status === 'confirmed').length,
    confirmed_estimated: prospects.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.estimated_amount, 0),
    pending_count: prospects.filter((p) => p.status === 'pending').length,
  };

  return NextResponse.json({ prospects, summary });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id: projectId } = await params;

  const body = (await request.json().catch(() => ({}))) as NewProspect;
  const donorId = String(body.donor_id || '').trim();
  if (!donorId) return NextResponse.json({ error: 'donor_id required' }, { status: 400 });

  const amount = Number(body.estimated_amount || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'estimated_amount must be >= 0' }, { status: 400 });
  }
  const status = body.status && VALID_STATUSES.has(body.status) ? body.status : 'pending';

  // Verify donor belongs to this owner.
  const donor = await db().execute({
    sql: 'SELECT id FROM fr_donors WHERE id = ? AND owner_id = ?',
    args: [donorId, session.ownerId],
  });
  if (donor.rows.length === 0) return NextResponse.json({ error: 'Donor not found' }, { status: 404 });

  const id = crypto.randomUUID();
  try {
    await db().execute({
      sql: `INSERT INTO fr_project_prospects
              (id, owner_id, project_id, donor_id, estimated_amount, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, session.ownerId, projectId, donorId, amount, status, body.notes || null],
    });
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('UNIQUE')) {
      return NextResponse.json(
        { error: 'This donor is already on the prospect list for this campaign.' },
        { status: 409 },
      );
    }
    throw err;
  }
  return NextResponse.json({ id });
}
