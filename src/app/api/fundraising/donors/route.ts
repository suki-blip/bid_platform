import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

interface PhoneInput {
  label?: string;
  phone: string;
  is_primary?: boolean;
}
interface AddressInput {
  label?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  is_reception?: boolean;
  is_primary?: boolean;
}

export async function GET(request: NextRequest) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const url = new URL(request.url);
  const status = url.searchParams.get('status'); // 'prospect' | 'donor' | null
  const search = url.searchParams.get('search')?.trim() || '';
  const sourceId = url.searchParams.get('source_id') || '';
  const assignedTo = url.searchParams.get('assigned_to') || '';
  const limit = Math.min(Number(url.searchParams.get('limit') || '100'), 500);
  const offset = Number(url.searchParams.get('offset') || '0');

  let where = 'd.owner_id = ?';
  const args: (string | number)[] = [session.ownerId];

  if (session.role === 'fundraiser') {
    where += ' AND d.assigned_to = ?';
    args.push(session.fundraiserId!);
  } else if (assignedTo === 'unassigned') {
    where += ' AND d.assigned_to IS NULL';
  } else if (assignedTo) {
    where += ' AND d.assigned_to = ?';
    args.push(assignedTo);
  }

  if (status === 'prospect' || status === 'donor') {
    where += ' AND d.status = ?';
    args.push(status);
  }
  if (sourceId) {
    where += ' AND d.source_id = ?';
    args.push(sourceId);
  }
  if (search) {
    where +=
      " AND (d.first_name LIKE ? OR d.last_name LIKE ? OR d.hebrew_name LIKE ? OR d.email LIKE ? OR d.organization LIKE ?)";
    const q = `%${search}%`;
    args.push(q, q, q, q, q);
  }

  const totalRes = await db().execute({
    sql: `SELECT COUNT(*) AS c FROM fr_donors d WHERE ${where}`,
    args,
  });

  const rowsRes = await db().execute({
    sql: `SELECT
            d.id, d.status, d.first_name, d.last_name, d.hebrew_name, d.email, d.organization,
            d.total_pledged, d.total_paid, d.last_contact_at, d.next_followup_at,
            d.created_at, d.assigned_to, d.tags, d.financial_rating, d.giving_rating,
            s.name AS source_name,
            tm.name AS assigned_name,
            (SELECT phone FROM fr_donor_phones p WHERE p.donor_id = d.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_phone,
            (SELECT city FROM fr_donor_addresses a WHERE a.donor_id = d.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_city
          FROM fr_donors d
          LEFT JOIN fr_sources s ON s.id = d.source_id
          LEFT JOIN team_members tm ON tm.id = d.assigned_to
          WHERE ${where}
          ORDER BY d.created_at DESC
          LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  });

  return NextResponse.json({
    total: Number(totalRes.rows[0]?.c || 0),
    donors: rowsRes.rows.map((r) => ({
      id: String(r.id),
      status: String(r.status),
      first_name: String(r.first_name),
      last_name: r.last_name ? String(r.last_name) : null,
      hebrew_name: r.hebrew_name ? String(r.hebrew_name) : null,
      email: r.email ? String(r.email) : null,
      organization: r.organization ? String(r.organization) : null,
      total_pledged: Number(r.total_pledged || 0),
      total_paid: Number(r.total_paid || 0),
      last_contact_at: r.last_contact_at ? String(r.last_contact_at) : null,
      next_followup_at: r.next_followup_at ? String(r.next_followup_at) : null,
      created_at: String(r.created_at),
      assigned_to: r.assigned_to ? String(r.assigned_to) : null,
      assigned_name: r.assigned_name ? String(r.assigned_name) : null,
      source_name: r.source_name ? String(r.source_name) : null,
      primary_phone: r.primary_phone ? String(r.primary_phone) : null,
      primary_city: r.primary_city ? String(r.primary_city) : null,
      tags: (() => {
        try {
          return JSON.parse(String(r.tags || '[]')) as string[];
        } catch {
          return [];
        }
      })(),
      financial_rating: r.financial_rating == null ? null : Number(r.financial_rating),
      giving_rating: r.giving_rating == null ? null : Number(r.giving_rating),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const body = await request.json();
  const firstName = (body.first_name || '').trim();
  if (!firstName) return NextResponse.json({ error: 'First name is required' }, { status: 400 });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Default assignment: fundraiser self-assigns; manager can pick or leave null
  let assignedTo: string | null = null;
  if (session.role === 'fundraiser') {
    assignedTo = session.fundraiserId;
  } else if (body.assigned_to) {
    assignedTo = String(body.assigned_to);
  }

  const status = body.status === 'donor' ? 'donor' : 'prospect';

  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO fr_donors (
              id, owner_id, assigned_to, status,
              first_name, last_name, hebrew_name, title, spouse_name,
              email, organization, occupation,
              birthday, yahrzeit, anniversary,
              tags, source_id, source_notes, preferred_contact, do_not_contact,
              notes, created_at, created_by, converted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        session.ownerId,
        assignedTo,
        status,
        firstName,
        body.last_name || null,
        body.hebrew_name || null,
        body.title || null,
        body.spouse_name || null,
        body.email || null,
        body.organization || null,
        body.occupation || null,
        body.birthday || null,
        body.yahrzeit || null,
        body.anniversary || null,
        JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
        body.source_id || null,
        body.source_notes || null,
        body.preferred_contact || null,
        body.do_not_contact ? 1 : 0,
        body.notes || null,
        now,
        session.actorId,
        status === 'donor' ? now : null,
      ],
    },
  ];

  const phones: PhoneInput[] = Array.isArray(body.phones) ? body.phones : [];
  phones.forEach((p, i) => {
    if (!p.phone || !p.phone.trim()) return;
    statements.push({
      sql: 'INSERT INTO fr_donor_phones (id, donor_id, label, phone, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      args: [crypto.randomUUID(), id, p.label || 'mobile', p.phone.trim(), p.is_primary || i === 0 ? 1 : 0, i],
    });
  });

  const addresses: AddressInput[] = Array.isArray(body.addresses) ? body.addresses : [];
  addresses.forEach((a, i) => {
    const hasContent = a.street || a.city || a.state || a.zip || a.country;
    if (!hasContent) return;
    statements.push({
      sql: `INSERT INTO fr_donor_addresses
              (id, donor_id, label, street, city, state, zip, country, is_reception, is_primary, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        id,
        a.label || 'home',
        a.street || null,
        a.city || null,
        a.state || null,
        a.zip || null,
        a.country || null,
        a.is_reception ? 1 : 0,
        a.is_primary || i === 0 ? 1 : 0,
        i,
      ],
    });
  });

  await db().batch(statements, 'write');

  return NextResponse.json({ id, status });
}
