import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; phoneId: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id, phoneId } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if ('label' in body) {
    sets.push('label = ?');
    args.push(body.label || 'mobile');
  }
  if ('phone' in body) {
    sets.push('phone = ?');
    args.push(String(body.phone).trim());
  }
  if ('is_primary' in body) {
    if (body.is_primary) {
      await db().execute({
        sql: 'UPDATE fr_donor_phones SET is_primary = 0 WHERE donor_id = ?',
        args: [id],
      });
    }
    sets.push('is_primary = ?');
    args.push(body.is_primary ? 1 : 0);
  }

  if (sets.length === 0) return NextResponse.json({ ok: true });
  args.push(phoneId, id);
  await db().execute({
    sql: `UPDATE fr_donor_phones SET ${sets.join(', ')} WHERE id = ? AND donor_id = ?`,
    args,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; phoneId: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id, phoneId } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await db().execute({
    sql: 'DELETE FROM fr_donor_phones WHERE id = ? AND donor_id = ?',
    args: [phoneId, id],
  });
  return NextResponse.json({ ok: true });
}
