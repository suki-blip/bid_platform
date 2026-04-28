import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getTeamSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getTeamSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbReady();

    // Fetch fresh data from DB
    const result = await db().execute({
      sql: `SELECT id, owner_id, name, email, role, can_view_budget, status
            FROM team_members WHERE id = ? AND status = 'active'`,
      args: [session.teamMemberId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    const member = result.rows[0];

    // Fetch assigned project IDs
    const projects = await db().execute({
      sql: `SELECT project_id FROM team_member_projects WHERE team_member_id = ?`,
      args: [session.teamMemberId],
    });

    return NextResponse.json({
      id: member.id,
      ownerId: member.owner_id,
      name: member.name,
      email: member.email,
      role: member.role,
      can_view_budget: Boolean(member.can_view_budget),
      status: member.status,
      project_ids: projects.rows.map((p) => String(p.project_id)),
    });
  } catch (error) {
    console.error('Team member me error:', error);
    return NextResponse.json({ error: 'Failed to get team member info' }, { status: 500 });
  }
}
