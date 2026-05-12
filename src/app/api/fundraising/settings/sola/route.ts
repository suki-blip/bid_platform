import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

// Settings endpoint for Sola/Cardknox credentials.
//
// GET  → returns { has_xkey, ifields_key, software_name, xkey_masked }
//        — xKey itself is never returned in full; we send only "••••<last 4>" so the
//          settings page can show "key on file" without exposing it client-side.
// PATCH → accepts { xkey, ifields_key, software_name }.
//         Empty strings clear the field; undefined fields are untouched.

function maskKey(k: string | null): string | null {
  if (!k) return null;
  if (k.length <= 8) return '••••';
  return '••••' + k.slice(-4);
}

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await dbReady();

  const r = await db().execute({
    sql: 'SELECT sola_xkey, sola_ifields_key, sola_software_name FROM saas_users WHERE id = ?',
    args: [session.ownerId],
  });
  const xkey = (r.rows[0]?.sola_xkey as string | null) || null;
  return NextResponse.json({
    has_xkey: !!xkey,
    xkey_masked: maskKey(xkey),
    ifields_key: (r.rows[0]?.sola_ifields_key as string | null) || '',
    software_name: (r.rows[0]?.sola_software_name as string | null) || 'easyfundraisings',
  });
}

export async function PATCH(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await dbReady();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: string[] = [];
  const args: (string | null)[] = [];

  if ('xkey' in body) {
    const v = String(body.xkey ?? '').trim();
    updates.push('sola_xkey = ?');
    args.push(v || null);
  }
  if ('ifields_key' in body) {
    const v = String(body.ifields_key ?? '').trim();
    updates.push('sola_ifields_key = ?');
    args.push(v || null);
  }
  if ('software_name' in body) {
    const v = String(body.software_name ?? '').trim();
    updates.push('sola_software_name = ?');
    args.push(v || null);
  }
  if (updates.length === 0) return NextResponse.json({ ok: true });

  args.push(session.ownerId);
  await db().execute({
    sql: `UPDATE saas_users SET ${updates.join(', ')} WHERE id = ?`,
    args,
  });
  return NextResponse.json({ ok: true });
}
