import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import type { InValue } from '@libsql/client';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;
    const body = await request.json();
    const includeBids = body.include_bids === true;

    // Fetch original project
    const projResult = await db().execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [id],
    });
    if (projResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const orig = projResult.rows[0];
    const newProjectId = crypto.randomUUID();

    const statements: { sql: string; args: InValue[] }[] = [];

    // Clone project
    statements.push({
      sql: 'INSERT INTO projects (id, name, address, type, description, status) VALUES (?, ?, ?, ?, ?, ?)',
      args: [newProjectId, `${orig.name} (Copy)`, orig.address, orig.type, orig.description, 'draft'],
    });

    // Clone team
    const teamResult = await db().execute({
      sql: 'SELECT * FROM project_team WHERE project_id = ?',
      args: [id],
    });
    for (const m of teamResult.rows) {
      statements.push({
        sql: 'INSERT INTO project_team (id, project_id, email, name, role) VALUES (?, ?, ?, ?, ?)',
        args: [crypto.randomUUID(), newProjectId, m.email, m.name, m.role],
      });
    }

    // Clone categories
    const catResult = await db().execute({
      sql: 'SELECT * FROM project_categories WHERE project_id = ?',
      args: [id],
    });
    for (const c of catResult.rows) {
      statements.push({
        sql: 'INSERT INTO project_categories (id, project_id, category_id) VALUES (?, ?, ?)',
        args: [crypto.randomUUID(), newProjectId, c.category_id],
      });
    }

    // Clone project files (including BLOB data)
    const filesResult = await db().execute({
      sql: 'SELECT * FROM project_files WHERE project_id = ?',
      args: [id],
    });
    for (const f of filesResult.rows) {
      statements.push({
        sql: 'INSERT INTO project_files (id, project_id, filename, data) VALUES (?, ?, ?, ?)',
        args: [crypto.randomUUID(), newProjectId, f.filename, f.data],
      });
    }

    // Optionally clone bids (without responses/invitations/winners)
    if (includeBids) {
      const bidsResult = await db().execute({
        sql: 'SELECT * FROM bids WHERE project_id = ?',
        args: [id],
      });
      for (const bid of bidsResult.rows) {
        const newBidId = crypto.randomUUID();
        statements.push({
          sql: 'INSERT INTO bids (id, title, description, deadline, status, project_id) VALUES (?, ?, ?, ?, ?, ?)',
          args: [newBidId, bid.title, bid.description, bid.deadline, 'draft', newProjectId],
        });

        // Clone bid parameters and options
        const paramsResult = await db().execute({
          sql: 'SELECT * FROM bid_parameters WHERE bid_id = ? ORDER BY sort_order',
          args: [bid.id],
        });
        for (const p of paramsResult.rows) {
          const newParamId = crypto.randomUUID();
          statements.push({
            sql: 'INSERT INTO bid_parameters (id, bid_id, name, sort_order) VALUES (?, ?, ?, ?)',
            args: [newParamId, newBidId, p.name, p.sort_order],
          });

          const optsResult = await db().execute({
            sql: 'SELECT * FROM bid_parameter_options WHERE parameter_id = ? ORDER BY sort_order',
            args: [p.id],
          });
          for (const o of optsResult.rows) {
            statements.push({
              sql: 'INSERT INTO bid_parameter_options (id, parameter_id, value, sort_order) VALUES (?, ?, ?, ?)',
              args: [crypto.randomUUID(), newParamId, o.value, o.sort_order],
            });
          }
        }
      }
    }

    if (statements.length > 0) {
      await db().batch(statements, 'write');
    }

    return NextResponse.json({ id: newProjectId, name: `${orig.name} (Copy)` }, { status: 201 });
  } catch (error) {
    console.error('Error cloning project:', error);
    return NextResponse.json({ error: 'Failed to clone project' }, { status: 500 });
  }
}
