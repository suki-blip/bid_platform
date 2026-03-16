import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getVendorFromRequest } from '@/lib/vendor-auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const vendor = await getVendorFromRequest(request);
    if (!vendor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: bidId } = await params;
    await dbReady();

    // Get bid info + invitation + response
    const bidResult = await db().execute({
      sql: `
        SELECT
          b.id as bid_id, b.title, b.description, b.deadline, b.status as bid_status,
          b.project_id, p.name as project_name,
          bi.id as invitation_id, bi.status as invitation_status, bi.sent_at, bi.submitted_at, bi.token,
          vr.id as response_id, vr.pricing_mode, vr.base_price, vr.rules, vr.submitted_at as response_date,
          bw.id as winner_id, bw.vendor_id as winner_vendor_id, bw.notes as winner_notes, bw.selected_at
        FROM bid_invitations bi
        JOIN bids b ON b.id = bi.bid_id
        LEFT JOIN projects p ON p.id = b.project_id
        LEFT JOIN vendor_responses vr ON vr.bid_id = b.id AND vr.vendor_id = bi.vendor_id
        LEFT JOIN bid_winners bw ON bw.bid_id = b.id
        WHERE bi.bid_id = ? AND bi.vendor_id = ?
      `,
      args: [bidId, String(vendor.id)],
    });

    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const bid = bidResult.rows[0] as Record<string, unknown>;

    // Determine display status
    let display_status = 'open';
    if (bid.winner_vendor_id === String(vendor.id)) display_status = 'won';
    else if (bid.winner_id) display_status = 'lost';
    else if (bid.invitation_status === 'submitted') display_status = 'pending_review';
    else if (bid.invitation_status === 'expired') display_status = 'expired';

    // Get parameters
    const paramsResult = await db().execute({
      sql: `SELECT bp.id, bp.name, bp.sort_order FROM bid_parameters bp WHERE bp.bid_id = ? ORDER BY bp.sort_order`,
      args: [bidId],
    });

    const parameters = [];
    for (const p of paramsResult.rows) {
      const optResult = await db().execute({
        sql: `SELECT value FROM bid_parameter_options WHERE parameter_id = ? ORDER BY sort_order`,
        args: [String((p as Record<string, unknown>).id)],
      });
      parameters.push({
        name: (p as Record<string, unknown>).name,
        options: optResult.rows.map((o: Record<string, unknown>) => o.value),
      });
    }

    // Get submitted prices if response exists
    let prices: Record<string, unknown>[] = [];
    if (bid.response_id) {
      const priceResult = await db().execute({
        sql: 'SELECT combination_key, price FROM vendor_prices WHERE response_id = ? ORDER BY combination_key',
        args: [String(bid.response_id)],
      });
      prices = priceResult.rows as Record<string, unknown>[];
    }

    // Timeline events
    const timeline = [
      { event: 'Invited', date: bid.sent_at },
      ...(bid.submitted_at ? [{ event: 'Bid Submitted', date: bid.submitted_at }] : []),
      ...(bid.selected_at ? [{
        event: display_status === 'won' ? 'Selected as Winner!' : 'Winner Selected',
        date: bid.selected_at,
      }] : []),
    ];

    return NextResponse.json({
      ...bid,
      display_status,
      parameters,
      prices,
      timeline,
    });
  } catch (error) {
    console.error('Error fetching bid detail:', error);
    return NextResponse.json({ error: 'Failed to fetch bid' }, { status: 500 });
  }
}
