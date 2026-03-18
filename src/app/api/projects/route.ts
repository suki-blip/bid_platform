import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getContractorSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    await dbReady();
    const session = await getContractorSession();

    let result;
    if (session) {
      // Logged-in contractor: show only their projects + unowned projects
      result = await db().execute({
        sql: `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count
              FROM projects p
              WHERE p.owner_id = ? OR p.owner_id IS NULL
              ORDER BY p.created_at DESC`,
        args: [session.userId],
      });
    } else {
      // No session (shouldn't happen with middleware, but fallback)
      result = await db().execute({
        sql: `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count FROM projects p ORDER BY p.created_at DESC`,
        args: [],
      });
    }

    return NextResponse.json(result.rows);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects', details: msg },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady();
    const session = await getContractorSession();

    const body = await request.json();
    const { name, address, type, description, status } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const ownerId = session?.userId || null;

    await db().execute({
      sql: 'INSERT INTO projects (id, name, address, type, description, status, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, name, address || null, type || null, description || null, status || 'active', ownerId],
    });

    const createdResult = await db().execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [id],
    });

    return NextResponse.json(createdResult.rows[0], { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
