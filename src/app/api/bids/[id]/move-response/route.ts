import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

// POST: Move a vendor response from this bid to a bid in a different category
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: fromBidId } = await params;
    const { response_id, target_category_id, project_id } = await request.json();

    if (!response_id || !target_category_id || !project_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find or create a bid in the target category
    const existingBid = await db().execute({
      sql: "SELECT id FROM bids WHERE project_id = ? AND trade_category_id = ? AND status != 'closed' ORDER BY created_at DESC LIMIT 1",
      args: [project_id, target_category_id],
    });

    let targetBidId: string;
    if (existingBid.rows.length > 0) {
      targetBidId = existingBid.rows[0].id as string;
    } else {
      // Create a new open-mode bid in target category
      targetBidId = crypto.randomUUID();
      const catName = await db().execute({ sql: 'SELECT name FROM trade_categories WHERE id = ?', args: [target_category_id] });
      const catNameStr = (catName.rows[0]?.name as string) || 'Bid';
      const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      await db().execute({
        sql: "INSERT INTO bids (id, title, description, deadline, status, project_id, trade_category_id, bid_mode) VALUES (?, ?, ?, ?, 'active', ?, ?, 'open')",
        args: [targetBidId, catNameStr, `Bid for ${catNameStr}`, deadline, project_id, target_category_id],
      });
    }

    // Move the response: update bid_id
    await db().execute({
      sql: 'UPDATE vendor_responses SET bid_id = ? WHERE id = ?',
      args: [targetBidId, response_id],
    });

    // Also move vendor_prices
    await db().execute({
      sql: 'UPDATE vendor_prices SET bid_id = ? WHERE response_id = ? AND bid_id IS NOT NULL',
      args: [targetBidId, response_id],
    }).catch(() => {}); // vendor_prices might not have bid_id column

    return NextResponse.json({ success: true, target_bid_id: targetBidId });
  } catch (error) {
    console.error('Error moving response:', error);
    return NextResponse.json({ error: 'Failed to move response' }, { status: 500 });
  }
}
