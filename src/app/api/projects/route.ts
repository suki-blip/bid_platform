import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getContractorSession, getTeamSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    await dbReady();
    const session = await getContractorSession();
    const teamSession = !session ? await getTeamSession() : null;

    let result;
    if (teamSession) {
      // Team member: show owner's projects, filtered by assigned projects
      const assignedResult = await db().execute({
        sql: 'SELECT project_id FROM team_member_projects WHERE team_member_id = ?',
        args: [teamSession.teamMemberId],
      });
      const assignedIds = assignedResult.rows.map((r: any) => r.project_id as string);

      if (assignedIds.length > 0) {
        // Has specific project assignments
        const placeholders = assignedIds.map(() => '?').join(',');
        result = await db().execute({
          sql: `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count,
              (SELECT COUNT(*) FROM project_categories pc WHERE pc.project_id = p.id) as category_count
                FROM projects p
                WHERE p.id IN (${placeholders})
                ORDER BY p.created_at DESC`,
          args: assignedIds,
        });
      } else {
        // No specific assignments = access to all owner's projects
        result = await db().execute({
          sql: `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count,
              (SELECT COUNT(*) FROM project_categories pc WHERE pc.project_id = p.id) as category_count
                FROM projects p
                WHERE p.owner_id = ? OR p.owner_id IS NULL
                ORDER BY p.created_at DESC`,
          args: [teamSession.ownerId],
        });
      }

      // Hide budget if team member can't view it
      if (!teamSession.can_view_budget) {
        result = { ...result, rows: result.rows.map((r: any) => ({ ...r, budget: null })) };
      }
    } else if (session) {
      // Logged-in contractor: show only their projects + unowned projects
      result = await db().execute({
        sql: `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count,
              (SELECT COUNT(*) FROM project_categories pc WHERE pc.project_id = p.id) as category_count
              FROM projects p
              WHERE p.owner_id = ? OR p.owner_id IS NULL
              ORDER BY p.created_at DESC`,
        args: [session.userId],
      });
    } else {
      result = await db().execute({
        sql: `SELECT p.*, (SELECT COUNT(*) FROM bids b WHERE b.project_id = p.id) as bid_count,
              (SELECT COUNT(*) FROM project_categories pc WHERE pc.project_id = p.id) as category_count FROM projects p ORDER BY p.created_at DESC`,
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
