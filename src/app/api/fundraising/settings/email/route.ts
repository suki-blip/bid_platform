import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

// Settings endpoint for fundraising email config (Resend).
//
// GET  → { email_from, email_signature, has_resend_key, resend_key_masked, env_key_available }
//        We never return the full Resend API key; only "••••<last4>" so the Settings page
//        can show "key on file" without exposing it client-side.
//
// PATCH → accepts { email_from?, email_signature?, resend_api_key? }
//         Empty string clears the field. Undefined fields are untouched.

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
    sql: 'SELECT email_from, email_signature, resend_api_key FROM saas_users WHERE id = ?',
    args: [session.ownerId],
  });
  const key = (r.rows[0]?.resend_api_key as string | null) || null;
  return NextResponse.json({
    email_from: (r.rows[0]?.email_from as string | null) || '',
    email_signature: (r.rows[0]?.email_signature as string | null) || '',
    has_resend_key: !!key,
    resend_key_masked: maskKey(key),
    env_key_available: !!process.env.RESEND_API_KEY,
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

  if ('email_from' in body) {
    updates.push('email_from = ?');
    args.push(String(body.email_from ?? '').trim() || null);
  }
  if ('email_signature' in body) {
    updates.push('email_signature = ?');
    args.push(String(body.email_signature ?? '').trim() || null);
  }
  if ('resend_api_key' in body) {
    updates.push('resend_api_key = ?');
    args.push(String(body.resend_api_key ?? '').trim() || null);
  }
  if (updates.length === 0) return NextResponse.json({ ok: true });

  args.push(session.ownerId);
  await db().execute({
    sql: `UPDATE saas_users SET ${updates.join(', ')} WHERE id = ?`,
    args,
  });
  return NextResponse.json({ ok: true });
}
