import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getContractorSession } from '@/lib/session';
import { hashPassword, validatePassword } from '@/lib/auth';
import crypto from 'crypto';

export async function GET() {
  try {
    await dbReady();
    const session = await getContractorSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const members = await db().execute({
      sql: `SELECT id, name, email, role, can_view_budget, status, created_at
            FROM team_members WHERE owner_id = ? ORDER BY created_at DESC`,
      args: [session.userId],
    });

    // Fetch project assignments for all members
    const membersWithProjects = await Promise.all(
      members.rows.map(async (member) => {
        const projects = await db().execute({
          sql: `SELECT project_id FROM team_member_projects WHERE team_member_id = ?`,
          args: [String(member.id)],
        });
        return {
          ...member,
          can_view_budget: Boolean(member.can_view_budget),
          project_ids: projects.rows.map((p) => String(p.project_id)),
        };
      })
    );

    return NextResponse.json(membersWithProjects);
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbReady();
    const session = await getContractorSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, email, password, role, can_view_budget, project_ids } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    if (role && !['viewer', 'editor'].includes(role)) {
      return NextResponse.json({ error: 'Role must be viewer or editor' }, { status: 400 });
    }

    const validation = validatePassword(password);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Check duplicate email for this owner
    const existing = await db().execute({
      sql: `SELECT id FROM team_members WHERE owner_id = ? AND email = ?`,
      args: [session.userId, email.toLowerCase().trim()],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'A team member with this email already exists' }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await db().execute({
      sql: `INSERT INTO team_members (id, owner_id, name, email, password_hash, role, can_view_budget)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, session.userId, name, email.toLowerCase().trim(), passwordHash, role || 'viewer', can_view_budget ? 1 : 0],
    });

    // Insert project assignments
    if (project_ids && Array.isArray(project_ids)) {
      for (const projectId of project_ids) {
        await db().execute({
          sql: `INSERT INTO team_member_projects (id, team_member_id, project_id) VALUES (?, ?, ?)`,
          args: [crypto.randomUUID(), id, projectId],
        });
      }
    }

    return NextResponse.json({
      id,
      name,
      email: email.toLowerCase().trim(),
      role: role || 'viewer',
      can_view_budget: Boolean(can_view_budget),
      status: 'active',
      project_ids: project_ids || [],
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating team member:', error);
    return NextResponse.json({ error: 'Failed to create team member' }, { status: 500 });
  }
}
