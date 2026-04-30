import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const hasContent = body.street || body.city || body.state || body.zip || body.country;
  if (!hasContent) return NextResponse.json({ error: 'Address is empty' }, { status: 400 });

  const addrId = crypto.randomUUID();
  if (body.is_primary) {
    await db().execute({ sql: 'UPDATE fr_donor_addresses SET is_primary = 0 WHERE donor_id = ?', args: [id] });
  }

  await db().execute({
    sql: `INSERT INTO fr_donor_addresses
            (id, donor_id, label, street, city, state, zip, country, is_reception, is_primary, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      addrId,
      id,
      body.label || 'home',
      body.street || null,
      body.city || null,
      body.state || null,
      body.zip || null,
      body.country || null,
      body.is_reception ? 1 : 0,
      body.is_primary ? 1 : 0,
      body.sort_order ?? 99,
    ],
  });

  return NextResponse.json({ id: addrId });
}
