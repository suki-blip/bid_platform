import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getVendorFromRequest } from '@/lib/vendor-auth';

export async function GET(request: Request) {
  try {
    const vendor = await getVendorFromRequest(request);
    if (!vendor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbReady();

    const result = await db().execute({
      sql: `
        SELECT
          bi.id as invitation_id,
          bi.status as invitation_status,
          bi.sent_at,
          bi.submitted_at,
          bi.token,
          b.id as bid_id,
          b.title,
          b.description,
          b.deadline,
          b.status as bid_status,
          b.project_id,
          p.name as project_name,
          vr.id as response_id,
          vr.pricing_mode,
          vr.base_price,
          vr.submitted_at as response_date,
          bw.id as winner_id,
          bw.vendor_id as winner_vendor_id,
          bw.notes as winner_notes
        FROM bid_invitations bi
        JOIN bids b ON b.id = bi.bid_id
        LEFT JOIN projects p ON p.id = b.project_id
        LEFT JOIN vendor_responses vr ON vr.bid_id = b.id AND vr.vendor_id = bi.vendor_id
        LEFT JOIN bid_winners bw ON bw.bid_id = b.id
        WHERE bi.vendor_id = ?
        ORDER BY bi.sent_at DESC
      `,
      args: [String(vendor.id)],
    });

    const bids = result.rows.map((row: Record<string, unknown>) => {
      let display_status = 'open';
      if (row.winner_vendor_id === vendor.id) {
        display_status = 'won';
      } else if (row.winner_id) {
        display_status = 'lost';
      } else if (row.invitation_status === 'submitted') {
        display_status = 'pending_review';
      } else if (row.invitation_status === 'expired') {
        display_status = 'expired';
      } else if (row.invitation_status === 'pending' || row.invitation_status === 'opened') {
        display_status = 'open';
      }

      // Get total submitted price if available
      return { ...row, display_status };
    });

    // Also get total prices for submitted bids
    for (const bid of bids) {
      const b = bid as Record<string, unknown>;
      if (b.response_id) {
        const priceResult = await db().execute({
          sql: 'SELECT SUM(price) as total FROM vendor_prices WHERE response_id = ?',
          args: [String(b.response_id)],
        });
        b.total_price = priceResult.rows[0]?.total || 0;
      }
    }

    return NextResponse.json(bids);
  } catch (error) {
    console.error('Error fetching vendor bids:', error);
    return NextResponse.json({ error: 'Failed to fetch bids' }, { status: 500 });
  }
}
