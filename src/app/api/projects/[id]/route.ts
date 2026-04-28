import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();

    const { id } = await params;

    const projectResult = await db().execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [id],
    });
    const project = projectResult.rows[0];

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const bidsResult = await db().execute({
      sql: `SELECT b.*, tc.name as trade_category, (SELECT COUNT(*) FROM vendor_responses vr WHERE vr.bid_id = b.id) as vendor_response_count FROM bids b LEFT JOIN trade_categories tc ON b.trade_category_id = tc.id WHERE b.project_id = ? ORDER BY b.created_at DESC`,
      args: [id],
    });

    const filesResult = await db().execute({
      sql: 'SELECT id, filename, uploaded_at FROM project_files WHERE project_id = ? ORDER BY uploaded_at DESC',
      args: [id],
    });

    const teamResult = await db().execute({
      sql: 'SELECT * FROM project_team WHERE project_id = ? ORDER BY created_at',
      args: [id],
    });

    const categoriesResult = await db().execute({
      sql: `SELECT pc.id, pc.category_id, pc.budget, tc.name, tc.grp FROM project_categories pc JOIN trade_categories tc ON pc.category_id = tc.id WHERE pc.project_id = ? ORDER BY tc.grp, tc.name`,
      args: [id],
    });

    // Get awarded prices: for each bid with a winner, get the winning vendor response base_price
    const winnersResult = await db().execute({
      sql: `SELECT bw.bid_id, b.trade_category_id, vr.base_price,
            (SELECT SUM(vp.price) FROM vendor_proposals vp WHERE vp.response_id = vr.id) as proposals_total
            FROM bid_winners bw
            JOIN bids b ON bw.bid_id = b.id
            JOIN vendor_responses vr ON bw.vendor_response_id = vr.id
            WHERE b.project_id = ?`,
      args: [id],
    });

    return NextResponse.json({
      ...project,
      bids: bidsResult.rows,
      files: filesResult.rows,
      team: teamResult.rows,
      categories: categoriesResult.rows,
      winners: winnersResult.rows,
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
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

    const allowedFields = ['name', 'address', 'type', 'description', 'status', 'image_url', 'budget', 'budget_visible'];
    const setClauses: string[] = [];
    const args: (string | null)[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        args.push(body[field]);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    args.push(id);

    const result = await db().execute({
      sql: `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const updatedProject = await db().execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [id],
    });

    return NextResponse.json(updatedProject.rows[0]);
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
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

    const projectResult = await db().execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [id],
    });

    if (projectResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await db().execute({
      sql: 'DELETE FROM projects WHERE id = ?',
      args: [id],
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
