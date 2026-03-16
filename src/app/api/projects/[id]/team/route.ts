import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    const result = await db().execute({
      sql: 'SELECT * FROM project_team WHERE project_id = ? ORDER BY created_at',
      args: [id],
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;
    const body = await request.json();

    const { email, name, role } = body;
    if (!email || !name) {
      return NextResponse.json({ error: 'Email and name are required' }, { status: 400 });
    }

    const memberId = crypto.randomUUID();
    await db().execute({
      sql: 'INSERT INTO project_team (id, project_id, email, name, role) VALUES (?, ?, ?, ?, ?)',
      args: [memberId, id, email, name, role || 'member'],
    });

    return NextResponse.json({ id: memberId, project_id: id, email, name, role: role || 'member' }, { status: 201 });
  } catch (error) {
    console.error('Error adding team member:', error);
    return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const body = await request.json();
    const { member_id } = body;

    if (!member_id) {
      return NextResponse.json({ error: 'member_id is required' }, { status: 400 });
    }

    await db().execute({
      sql: 'DELETE FROM project_team WHERE id = ?',
      args: [member_id],
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Error removing team member:', error);
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 });
  }
}
