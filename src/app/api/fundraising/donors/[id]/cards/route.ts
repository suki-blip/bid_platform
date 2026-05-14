import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { ensureDonorAccess } from '@/lib/fundraising-guard';

// GET /api/fundraising/donors/[id]/cards
//   Returns the saved cards for this donor (active only, default first).
//   Cards are tokenized — sola_token is never returned to the client; only the safe
//   metadata (last4, brand, exp, holder, default flag) is exposed.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const access = await ensureDonorAccess(id, session);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const result = await db().execute({
    sql: `SELECT id, cc_last4, cc_brand, exp_month, exp_year, cardholder_name,
                 billing_zip, billing_street, is_default, created_at, last_used_at
          FROM fr_donor_cards
          WHERE donor_id = ? AND status = 'active'
          ORDER BY is_default DESC, last_used_at DESC, created_at DESC`,
    args: [id],
  });

  // Mark cards as expired client-side if exp_month/year has passed. We keep them in the
  // DB so admins can see history, but we annotate so the UI can warn / hide them.
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  return NextResponse.json({
    cards: result.rows.map((r) => {
      const m = r.exp_month ? Number(r.exp_month) : null;
      const y = r.exp_year ? Number(r.exp_year) : null;
      const expired = m != null && y != null && (y < curYear || (y === curYear && m < curMonth));
      return {
        id: r.id,
        cc_last4: r.cc_last4,
        cc_brand: r.cc_brand,
        exp_month: m,
        exp_year: y,
        cardholder_name: r.cardholder_name,
        billing_zip: r.billing_zip,
        billing_street: r.billing_street,
        is_default: !!r.is_default,
        expired,
        created_at: r.created_at,
        last_used_at: r.last_used_at,
      };
    }),
  });
}
