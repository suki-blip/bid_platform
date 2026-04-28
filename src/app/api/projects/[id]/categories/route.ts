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
      sql: `SELECT pc.id, pc.category_id, pc.budget, tc.name, tc.grp
            FROM project_categories pc
            JOIN trade_categories tc ON pc.category_id = tc.id
            WHERE pc.project_id = ?
            ORDER BY tc.grp, tc.name`,
      args: [id],
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
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
    const { category_id, budget } = body;

    if (!category_id) {
      return NextResponse.json({ error: 'category_id is required' }, { status: 400 });
    }

    await db().execute({
      sql: 'UPDATE project_categories SET budget = ? WHERE project_id = ? AND category_id = ?',
      args: [budget ?? null, id, category_id],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating category budget:', error);
    return NextResponse.json({ error: 'Failed to update category budget' }, { status: 500 });
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

    const { category_ids } = body;
    if (!category_ids || !Array.isArray(category_ids) || category_ids.length === 0) {
      return NextResponse.json({ error: 'category_ids array is required' }, { status: 400 });
    }

    const statements = category_ids.map((catId: string) => ({
      sql: 'INSERT OR IGNORE INTO project_categories (id, project_id, category_id) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), id, catId],
    }));

    await db().batch(statements, 'write');

    // Return updated list
    const result = await db().execute({
      sql: `SELECT pc.id, pc.category_id, tc.name, tc.grp
            FROM project_categories pc
            JOIN trade_categories tc ON pc.category_id = tc.id
            WHERE pc.project_id = ?
            ORDER BY tc.grp, tc.name`,
      args: [id],
    });

    return NextResponse.json(result.rows, { status: 201 });
  } catch (error) {
    console.error('Error adding categories:', error);
    return NextResponse.json({ error: 'Failed to add categories' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const body = await request.json();
    const { category_id } = body;

    if (!category_id) {
      return NextResponse.json({ error: 'category_id is required' }, { status: 400 });
    }

    const { id } = await params;
    await db().execute({
      sql: 'DELETE FROM project_categories WHERE project_id = ? AND category_id = ?',
      args: [id, category_id],
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Error removing category:', error);
    return NextResponse.json({ error: 'Failed to remove category' }, { status: 500 });
  }
}
