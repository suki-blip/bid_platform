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
  const phone = (body.phone || '').trim();
  if (!phone) return NextResponse.json({ error: 'Phone is required' }, { status: 400 });

  const phoneId = crypto.randomUUID();

  if (body.is_primary) {
    await db().execute({
      sql: 'UPDATE fr_donor_phones SET is_primary = 0 WHERE donor_id = ?',
      args: [id],
    });
  }

  await db().execute({
    sql: 'INSERT INTO fr_donor_phones (id, donor_id, label, phone, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    args: [phoneId, id, body.label || 'mobile', phone, body.is_primary ? 1 : 0, body.sort_order ?? 99],
  });

  return NextResponse.json({ id: phoneId });
}
