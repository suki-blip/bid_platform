import { createHmac, randomBytes } from 'crypto';
import { db, dbReady } from '@/lib/db';

const VENDOR_COOKIE = 'vendor-auth';
const SECRET = () => process.env.VENDOR_SESSION_SECRET || process.env.ADMIN_API_SECRET || 'bidmaster-vendor-fallback-secret';
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export { VENDOR_COOKIE, MAX_AGE };

/** Create a signed session token for a vendor */
export function createVendorSession(vendorId: string): string {
  const payload = Buffer.from(JSON.stringify({ v: vendorId, t: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', SECRET()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Verify a session token and return vendorId or null */
export function verifyVendorSession(token: string): string | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;

    const expected = createHmac('sha256', SECRET()).update(payload).digest('base64url');
    if (sig !== expected) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    // Check max age
    if (Date.now() - data.t > MAX_AGE * 1000) return null;

    return data.v || null;
  } catch {
    return null;
  }
}

/** Get the authenticated vendor from a request's cookies */
export async function getVendorFromRequest(request: Request): Promise<Record<string, unknown> | null> {
  // Parse cookies from header
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );

  const token = cookies[VENDOR_COOKIE];
  if (!token) return null;

  const vendorId = verifyVendorSession(token);
  if (!vendorId) return null;

  await dbReady();
  const result = await db().execute({
    sql: `SELECT id, name, email, phone, contact_person, trade_category, website, license, notes, status FROM vendors WHERE id = ? AND status = 'active'`,
    args: [vendorId],
  });

  return (result.rows[0] as Record<string, unknown>) || null;
}
