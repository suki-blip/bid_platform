import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// POST: Vendor submits spec completion values
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await dbReady();
    const { token } = await params;
    const body = await request.json();
    const { response_id, specs, declined_specs } = body;
    // specs: { key: string, value: string }[]
    // declined_specs: string[] — specs the vendor says are not included

    if (!response_id) {
      return NextResponse.json({ error: 'response_id required' }, { status: 400 });
    }

    // Verify the token is valid and matches the bid
    const invResult = await db().execute({
      sql: 'SELECT bi.bid_id, bi.vendor_id FROM bid_invitations bi WHERE bi.token = ?',
      args: [token],
    });
    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }
    const { bid_id: bidId, vendor_id: vendorId } = invResult.rows[0];

    // Verify response belongs to this bid and vendor
    const respResult = await db().execute({
      sql: 'SELECT id, vendor_id FROM vendor_responses WHERE id = ? AND bid_id = ?',
      args: [response_id, bidId],
    });
    if (respResult.rows.length === 0) {
      return NextResponse.json({ error: 'Response not found' }, { status: 404 });
    }

    // Get the first proposal for this response to add specs to
    const proposalResult = await db().execute({
      sql: 'SELECT id FROM vendor_proposals WHERE response_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1',
      args: [response_id],
    });

    if (proposalResult.rows.length === 0) {
      return NextResponse.json({ error: 'No proposals found for this response' }, { status: 404 });
    }
    const proposalId = proposalResult.rows[0].id;

    // Add the included specs
    let addedCount = 0;
    if (specs && Array.isArray(specs)) {
      for (const spec of specs) {
        if (!spec.key || !spec.value) continue;

        // Check if this spec already exists for any proposal in this response
        const existingResult = await db().execute({
          sql: `SELECT vps.id FROM vendor_proposal_specs vps
                JOIN vendor_proposals vp ON vp.id = vps.proposal_id
                WHERE vp.response_id = ? AND LOWER(vps.spec_key) = LOWER(?)`,
          args: [response_id, spec.key],
        });

        if (existingResult.rows.length > 0) {
          // Update existing
          await db().execute({
            sql: 'UPDATE vendor_proposal_specs SET spec_value = ? WHERE id = ?',
            args: [spec.value, existingResult.rows[0].id],
          });
        } else {
          // Insert new
          const specId = crypto.randomUUID();
          await db().execute({
            sql: 'INSERT INTO vendor_proposal_specs (id, proposal_id, spec_key, spec_value) VALUES (?, ?, ?, ?)',
            args: [specId, proposalId, spec.key, spec.value],
          });
        }
        addedCount++;
      }
    }

    // For declined specs, add them with a "Not Included" value so contractor knows
    if (declined_specs && Array.isArray(declined_specs)) {
      for (const key of declined_specs) {
        // Check if already exists
        const existingResult = await db().execute({
          sql: `SELECT vps.id FROM vendor_proposal_specs vps
                JOIN vendor_proposals vp ON vp.id = vps.proposal_id
                WHERE vp.response_id = ? AND LOWER(vps.spec_key) = LOWER(?)`,
          args: [response_id, key],
        });

        if (existingResult.rows.length === 0) {
          const specId = crypto.randomUUID();
          await db().execute({
            sql: 'INSERT INTO vendor_proposal_specs (id, proposal_id, spec_key, spec_value) VALUES (?, ?, ?, ?)',
            args: [specId, proposalId, key, 'Not Included'],
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      added: addedCount,
    });
  } catch (error) {
    console.error('Error completing specs:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
