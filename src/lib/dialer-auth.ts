// Lightweight single-passcode gate for the standalone dialer (/dialer), independent of the
// BidMaster/fundraising login. Set DIALER_PASSCODE (the access code) and optionally
// DIALER_OWNER_EMAIL (whose saas_users account the dialer's calls are recorded under; defaults
// to the first user). The cookie just stores the passcode itself (httpOnly), compared server-side.

import { cookies } from 'next/headers';
import { db, dbReady } from './db';

const PASSCODE = process.env.DIALER_PASSCODE;
const OWNER_EMAIL = process.env.DIALER_OWNER_EMAIL;
const COOKIE = 'dialer_session';

export function dialerConfigured(): boolean {
  return Boolean(PASSCODE);
}

export function verifyPasscode(code: string): boolean {
  return Boolean(PASSCODE) && code === PASSCODE;
}

export async function isDialerAuthed(): Promise<boolean> {
  if (!PASSCODE) return false;
  const c = await cookies();
  return c.get(COOKIE)?.value === PASSCODE;
}

export function dialerCookieName(): string {
  return COOKIE;
}

// Resolve which saas_users.id the dialer's calls belong to (for the owner_id FK + list scoping).
let cachedOwner: string | null = null;
export async function resolveDialerOwnerId(): Promise<string | null> {
  if (cachedOwner) return cachedOwner;
  await dbReady();
  const r = OWNER_EMAIL
    ? await db().execute({ sql: 'SELECT id FROM saas_users WHERE email = ? LIMIT 1', args: [OWNER_EMAIL] })
    : await db().execute('SELECT id FROM saas_users ORDER BY rowid LIMIT 1');
  if (r.rows.length) { cachedOwner = String(r.rows[0].id); return cachedOwner; }
  return null;
}
