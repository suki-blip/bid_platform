import { NextResponse, NextRequest } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

// DELETE: Remove a vendor response
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: bidId } = await params;
    const { response_id } = await request.json();
    if (!response_id) return NextResponse.json({ error: 'response_id required' }, { status: 400 });

    // Delete in order: specs → proposals → prices → response
    await db().batch([
      { sql: 'DELETE FROM vendor_proposal_specs WHERE proposal_id IN (SELECT id FROM vendor_proposals WHERE response_id = ?)', args: [response_id] },
      { sql: 'DELETE FROM vendor_proposals WHERE response_id = ?', args: [response_id] },
      { sql: 'DELETE FROM vendor_prices WHERE response_id = ?', args: [response_id] },
      { sql: 'DELETE FROM vendor_responses WHERE id = ? AND bid_id = ?', args: [response_id, bidId] },
    ], 'write');

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting response:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PUT: Update an existing vendor response (replace proposals/specs)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: bidId } = await params;
    const body = await request.json();
    const { response_id, vendor_name, proposals } = body;
    if (!response_id) return NextResponse.json({ error: 'response_id required' }, { status: 400 });

    const statements: { sql: string; args: (string | number | null)[] }[] = [];

    // Update vendor name if provided
    if (vendor_name) {
      statements.push({
        sql: 'UPDATE vendor_responses SET vendor_name = ? WHERE id = ? AND bid_id = ?',
        args: [vendor_name, response_id, bidId],
      });
    }

    // Clear old proposals and prices
    statements.push(
      { sql: 'DELETE FROM vendor_proposal_specs WHERE proposal_id IN (SELECT id FROM vendor_proposals WHERE response_id = ?)', args: [response_id] },
      { sql: 'DELETE FROM vendor_proposals WHERE response_id = ?', args: [response_id] },
      { sql: 'DELETE FROM vendor_prices WHERE response_id = ?', args: [response_id] },
    );

    // Insert new proposals
    if (proposals && Array.isArray(proposals)) {
      for (let pi = 0; pi < proposals.length; pi++) {
        const prop = proposals[pi];
        const proposalId = crypto.randomUUID();
        statements.push({
          sql: 'INSERT INTO vendor_proposals (id, response_id, name, price, sort_order) VALUES (?, ?, ?, ?, ?)',
          args: [proposalId, response_id, prop.name || `Option ${pi + 1}`, prop.price || 0, pi],
        });

        if (prop.specs && Array.isArray(prop.specs)) {
          for (let si = 0; si < prop.specs.length; si++) {
            const spec = prop.specs[si];
            if (spec.key && spec.value) {
              statements.push({
                sql: 'INSERT INTO vendor_proposal_specs (id, proposal_id, spec_key, spec_value, sort_order) VALUES (?, ?, ?, ?, ?)',
                args: [crypto.randomUUID(), proposalId, spec.key, spec.value, si],
              });
            }
          }
        }

        statements.push({
          sql: 'INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), response_id, JSON.stringify({ _proposal: prop.name || `Option ${pi + 1}` }), prop.price || 0],
        });
      }
    }

    await db().batch(statements, 'write');
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating response:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST: Add a manual vendor response (contractor fills on behalf of vendor)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: bidId } = await params;
    const body = await request.json();
    const { vendor_name, vendor_id, proposals } = body;

    if (!vendor_name) {
      return NextResponse.json({ error: 'vendor_name is required' }, { status: 400 });
    }

    // Verify bid exists
    const bidResult = await db().execute({
      sql: 'SELECT id, bid_mode FROM bids WHERE id = ?',
      args: [bidId],
    });
    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const responseId = crypto.randomUUID();
    const statements: { sql: string; args: (string | number | null)[] }[] = [];

    if (proposals && Array.isArray(proposals) && proposals.length > 0) {
      // Open proposal mode
      statements.push({
        sql: 'INSERT INTO vendor_responses (id, bid_id, vendor_name, vendor_id, pricing_mode) VALUES (?, ?, ?, ?, ?)',
        args: [responseId, bidId, vendor_name, vendor_id || null, 'open'],
      });

      for (let pi = 0; pi < proposals.length; pi++) {
        const prop = proposals[pi];
        const proposalId = crypto.randomUUID();
        statements.push({
          sql: 'INSERT INTO vendor_proposals (id, response_id, name, price, sort_order) VALUES (?, ?, ?, ?, ?)',
          args: [proposalId, responseId, prop.name || `Option ${pi + 1}`, prop.price || 0, pi],
        });

        if (prop.specs && Array.isArray(prop.specs)) {
          for (let si = 0; si < prop.specs.length; si++) {
            const spec = prop.specs[si];
            if (spec.key && spec.value) {
              statements.push({
                sql: 'INSERT INTO vendor_proposal_specs (id, proposal_id, spec_key, spec_value, sort_order) VALUES (?, ?, ?, ?, ?)',
                args: [crypto.randomUUID(), proposalId, spec.key, spec.value, si],
              });
            }
          }
        }

        // Also add to vendor_prices for backward compatibility
        statements.push({
          sql: 'INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), responseId, JSON.stringify({ _proposal: prop.name || `Option ${pi + 1}` }), prop.price || 0],
        });
      }
    } else {
      // Simple price entry
      const { price } = body;
      statements.push({
        sql: 'INSERT INTO vendor_responses (id, bid_id, vendor_name, vendor_id, pricing_mode, base_price) VALUES (?, ?, ?, ?, ?, ?)',
        args: [responseId, bidId, vendor_name, vendor_id || null, 'combination', price || 0],
      });
      if (price) {
        statements.push({
          sql: 'INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), responseId, '{}', price],
        });
      }
    }

    await db().batch(statements, 'write');

    // Log activity
    await db().execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'manual_response', `Manual response added for ${vendor_name}`],
    });

    return NextResponse.json({ success: true, responseId }, { status: 201 });
  } catch (error) {
    console.error('Error adding manual response:', error);
    return NextResponse.json({ error: 'Failed to add response' }, { status: 500 });
  }
}
