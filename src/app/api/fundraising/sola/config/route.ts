import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

// GET /api/fundraising/sola/config
//
// Returns the public configuration the payment page needs:
//   - has_xkey:        whether the owner has set up Sola (so the page can show
//                      "Charge in system" vs fall back to redirect)
//   - ifields_key:     public-ish key for browser-side iFields tokenizer
//   - software_name:   passed to setAccount() — Cardknox tags transactions with it
//
// xKey is NOT included. It never leaves the server.
//
// Both managers AND fundraisers can read this (fundraisers may need to take payments too).

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();

  const r = await db().execute({
    sql: 'SELECT sola_xkey, sola_ifields_key, sola_software_name FROM saas_users WHERE id = ?',
    args: [session.ownerId],
  });
  const xkey = r.rows[0]?.sola_xkey as string | null;
  const ifieldsKey = r.rows[0]?.sola_ifields_key as string | null;
  return NextResponse.json({
    has_xkey: !!xkey,
    ifields_key: ifieldsKey || '',
    software_name: (r.rows[0]?.sola_software_name as string | null) || 'easyfundraisings',
    // Can charge in-system iff both keys are present
    can_charge: !!xkey && !!ifieldsKey,
  });
}
