import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

const VALID_STATUSES = ['draft', 'active', 'closed', 'awarded', 'paused'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();

    const { id } = await params;

    const bidResult = await db().execute({
      sql: 'SELECT * FROM bids WHERE id = ?',
      args: [id],
    });
    const bid = bidResult.rows[0];

    if (!bid) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const parametersResult = await db().execute({
      sql: 'SELECT * FROM bid_parameters WHERE bid_id = ?',
      args: [id],
    });

    const parametersWithOptions = await Promise.all(
      parametersResult.rows.map(async (param) => {
        const optionsResult = await db().execute({
          sql: 'SELECT value FROM bid_parameter_options WHERE parameter_id = ? ORDER BY sort_order',
          args: [param.id as string],
        });
        return {
          name: param.name,
          is_track: Number(param.is_track) === 1,
          options: optionsResult.rows.map((o) => o.value),
        };
      })
    );

    const filesResult = await db().execute({
      sql: 'SELECT id, filename FROM bid_files WHERE bid_id = ?',
      args: [id],
    });

    const vendorResponsesResult = await db().execute({
      sql: 'SELECT * FROM vendor_responses WHERE bid_id = ?',
      args: [id],
    });

    const responsesWithPrices = await Promise.all(
      vendorResponsesResult.rows.map(async (response) => {
        const pricesResult = await db().execute({
          sql: 'SELECT * FROM vendor_prices WHERE response_id = ?',
          args: [response.id as string],
        });

        // Load proposals for open mode
        const proposalsResult = await db().execute({
          sql: 'SELECT * FROM vendor_proposals WHERE response_id = ? ORDER BY sort_order',
          args: [response.id as string],
        });
        const proposals = await Promise.all(
          proposalsResult.rows.map(async (prop) => {
            const specsResult = await db().execute({
              sql: 'SELECT * FROM vendor_proposal_specs WHERE proposal_id = ? ORDER BY sort_order',
              args: [prop.id as string],
            });
            return {
              ...prop,
              specs: specsResult.rows.map(s => ({ key: s.spec_key, value: s.spec_value })),
            };
          })
        );

        return {
          ...response,
          rules: response.rules ? JSON.parse(response.rules as string) : [],
          prices: pricesResult.rows,
          proposals,
        };
      })
    );

    let checklist: { text: string; required: boolean }[] = [];
    try { checklist = JSON.parse((bid.checklist as string) || '[]'); } catch {}

    let suggested_specs: string[] = [];
    try { suggested_specs = JSON.parse((bid.suggested_specs as string) || '[]'); } catch {}

    return NextResponse.json({
      ...bid,
      checklist,
      suggested_specs,
      allow_ve: Number(bid.allow_ve) === 1,
      bid_mode: (bid.bid_mode as string) || 'structured',
      parameters: parametersWithOptions,
      files: filesResult.rows,
      vendor_responses: responsesWithPrices,
    });
  } catch (error) {
    console.error('Error fetching bid:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bid' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();

    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['title', 'description', 'deadline', 'status', 'project_id', 'allow_ve', 'bid_mode', 'compare_settings', 'suggested_specs'];
    const setClauses: string[] = [];
    const args: (string | null)[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'status' && !VALID_STATUSES.includes(body[field])) {
          return NextResponse.json(
            { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
            { status: 400 }
          );
        }
        setClauses.push(`${field} = ?`);
        const val = (field === 'compare_settings' || field === 'suggested_specs') && typeof body[field] !== 'string'
          ? JSON.stringify(body[field])
          : body[field];
        args.push(val);
      }
    }

    if (setClauses.length === 0 && !body.parameters) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    if (setClauses.length > 0) {
      args.push(id);
      const result = await db().execute({
        sql: `UPDATE bids SET ${setClauses.join(', ')} WHERE id = ?`,
        args,
      });
      if (result.rowsAffected === 0) {
        return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
      }
    }

    // Update parameters if provided
    if (body.parameters && Array.isArray(body.parameters)) {
      const crypto = await import('crypto');
      // Delete existing params
      await db().execute({ sql: 'DELETE FROM bid_parameters WHERE bid_id = ?', args: [id] });

      for (const param of body.parameters) {
        const paramId = crypto.randomUUID();
        await db().execute({
          sql: 'INSERT INTO bid_parameters (id, bid_id, name, sort_order, is_track) VALUES (?, ?, ?, ?, ?)',
          args: [paramId, id, param.name, param.sort_order ?? 0, param.is_track ? 1 : 0],
        });
        if (param.options && Array.isArray(param.options)) {
          for (let oi = 0; oi < param.options.length; oi++) {
            await db().execute({
              sql: 'INSERT INTO bid_parameter_options (id, parameter_id, value, sort_order) VALUES (?, ?, ?, ?)',
              args: [crypto.randomUUID(), paramId, param.options[oi], oi],
            });
          }
        }
      }
    }

    // Update checklist if provided
    if (body.checklist !== undefined) {
      await db().execute({
        sql: 'UPDATE bids SET checklist = ? WHERE id = ?',
        args: [JSON.stringify(body.checklist), id],
      });
    }

    // Update allow_ve if provided
    if (body.allow_ve !== undefined) {
      await db().execute({
        sql: 'UPDATE bids SET allow_ve = ? WHERE id = ?',
        args: [body.allow_ve ? 1 : 0, id],
      });
    }

    const updatedBid = await db().execute({
      sql: 'SELECT * FROM bids WHERE id = ?',
      args: [id],
    });

    return NextResponse.json(updatedBid.rows[0]);
  } catch (error) {
    console.error('Error updating bid:', error);
    return NextResponse.json(
      { error: 'Failed to update bid' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();

    const { id } = await params;

    const bidResult = await db().execute({
      sql: 'SELECT * FROM bids WHERE id = ?',
      args: [id],
    });

    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    await db().execute({
      sql: 'DELETE FROM bids WHERE id = ?',
      args: [id],
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error('Error deleting bid:', error);
    return NextResponse.json(
      { error: 'Failed to delete bid' },
      { status: 500 }
    );
  }
}
