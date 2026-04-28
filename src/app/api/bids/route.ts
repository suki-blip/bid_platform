import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  try {
    await dbReady();

    const bidsResult = await db().execute({ sql: 'SELECT * FROM bids', args: [] });
    const bids = bidsResult.rows;

    const result = await Promise.all(
      bids.map(async (bid) => {
        const parametersResult = await db().execute({
          sql: 'SELECT * FROM bid_parameters WHERE bid_id = ?',
          args: [bid.id as string],
        });

        const parametersWithOptions = await Promise.all(
          parametersResult.rows.map(async (param) => {
            const optionsResult = await db().execute({
              sql: 'SELECT value FROM bid_parameter_options WHERE parameter_id = ? ORDER BY sort_order',
              args: [param.id as string],
            });
            return {
              name: param.name,
              options: optionsResult.rows.map((o) => o.value),
            };
          })
        );

        const countResult = await db().execute({
          sql: 'SELECT COUNT(*) as count FROM vendor_responses WHERE bid_id = ?',
          args: [bid.id as string],
        });

        return {
          ...bid,
          parameters: parametersWithOptions,
          vendor_response_count: countResult.rows[0]?.count ?? 0,
        };
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching bids:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bids' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await dbReady();

    const body = await request.json();
    const { title, description, deadline, parameters, project_id, trade_category_id, status, checklist, allow_ve, bid_mode, suggested_specs } = body;

    if (!title || !description || !deadline) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, deadline' },
        { status: 400 }
      );
    }

    const bidId = crypto.randomUUID();

    const checklistJson = checklist ? JSON.stringify(checklist) : '[]';
    const suggestedSpecsJson = suggested_specs ? JSON.stringify(suggested_specs) : '[]';
    const statements: { sql: string; args: (string | number | null)[] }[] = [
      {
        sql: 'INSERT INTO bids (id, title, description, deadline, status, project_id, trade_category_id, checklist, allow_ve, bid_mode, suggested_specs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [bidId, title, description, deadline, status || 'draft', project_id || null, trade_category_id || null, checklistJson, allow_ve ? 1 : 0, bid_mode || 'structured', suggestedSpecsJson],
      },
    ];

    if (parameters && Array.isArray(parameters)) {
      for (const param of parameters) {
        const paramId = crypto.randomUUID();
        statements.push({
          sql: 'INSERT INTO bid_parameters (id, bid_id, name, is_track, sort_order) VALUES (?, ?, ?, ?, ?)',
          args: [paramId, bidId, param.name, param.is_track ? 1 : 0, param.sort_order ?? 0],
        });

        if (param.options && Array.isArray(param.options)) {
          for (const option of param.options) {
            const optionId = crypto.randomUUID();
            statements.push({
              sql: 'INSERT INTO bid_parameter_options (id, parameter_id, value) VALUES (?, ?, ?)',
              args: [optionId, paramId, option],
            });
          }
        }
      }
    }

    await db().batch(statements, 'write');

    const createdBidResult = await db().execute({
      sql: 'SELECT * FROM bids WHERE id = ?',
      args: [bidId],
    });

    return NextResponse.json(createdBidResult.rows[0], { status: 201 });
  } catch (error) {
    console.error('Error creating bid:', error);
    return NextResponse.json(
      { error: 'Failed to create bid' },
      { status: 500 }
    );
  }
}
