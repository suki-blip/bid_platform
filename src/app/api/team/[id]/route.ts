import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getContractorSession } from '@/lib/session';
import { hashPassword, validatePassword } from '@/lib/auth';
import crypto from 'crypto';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const session = await getContractorSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const member = await db().execute({
      sql: `SELECT id FROM team_members WHERE id = ? AND owner_id = ?`,
      args: [id, session.userId],
    });

    if (member.rows.length === 0) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Build update
    const setClauses: string[] = [];
    const args: (string | number | null)[] = [];

    if (body.name !== undefined) {
      setClauses.push('name = ?');
      args.push(body.name);
    }
    if (body.role !== undefined) {
      if (!['viewer', 'editor'].includes(body.role)) {
        return NextResponse.json({ error: 'Role must be viewer or editor' }, { status: 400 });
      }
      setClauses.push('role = ?');
      args.push(body.role);
    }
    if (body.can_view_budget !== undefined) {
      setClauses.push('can_view_budget = ?');
      args.push(body.can_view_budget ? 1 : 0);
    }
    if (body.status !== undefined) {
      setClauses.push('status = ?');
      args.push(body.status);
    }
    if (body.password !== undefined) {
      const validation = validatePassword(body.password);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const passwordHash = await hashPassword(body.password);
      setClauses.push('password_hash = ?');
      args.push(passwordHash);
    }

    if (setClauses.length > 0) {
      args.push(id);
      await db().execute({
        sql: `UPDATE team_members SET ${setClauses.join(', ')} WHERE id = ?`,
        args,
      });
    }

    // Update project assignments if provided
    if (body.project_ids !== undefined && Array.isArray(body.project_ids)) {
      await db().execute({
        sql: `DELETE FROM team_member_projects WHERE team_member_id = ?`,
        args: [id],
      });
      for (const projectId of body.project_ids) {
        await db().execute({
          sql: `INSERT INTO team_member_projects (id, team_member_id, project_id) VALUES (?, ?, ?)`,
          args: [crypto.randomUUID(), id, projectId],
        });
      }
    }

    // Return updated member
    const updated = await db().execute({
      sql: `SELECT id, name, email, role, can_view_budget, status, created_at
            FROM team_members WHERE id = ?`,
      args: [id],
    });
    const projects = await db().execute({
      sql: `SELECT project_id FROM team_member_projects WHERE team_member_id = ?`,
      args: [id],
    });

    return NextResponse.json({
      ...updated.rows[0],
      can_view_budget: Boolean(updated.rows[0].can_view_budget),
      project_ids: projects.rows.map((p) => String(p.project_id)),
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const session = await getContractorSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const member = await db().execute({
      sql: `SELECT id FROM team_members WHERE id = ? AND owner_id = ?`,
      args: [id, session.userId],
    });

    if (member.rows.length === 0) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Delete project assignments first, then the member
    await db().execute({
      sql: `DELETE FROM team_member_projects WHERE team_member_id = ?`,
      args: [id],
    });
    await db().execute({
      sql: `DELETE FROM team_members WHERE id = ?`,
      args: [id],
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error('Error deleting team member:', error);
    return NextResponse.json({ error: 'Failed to delete team member' }, { status: 500 });
  }
}
