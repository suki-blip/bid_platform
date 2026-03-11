import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    const result = await db().execute({
      sql: `SELECT v.*, tc.name as trade_name, tc.grp as trade_group
            FROM vendors v
            LEFT JOIN trade_categories tc ON tc.id = v.trade_category
            WHERE v.id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching vendor:', error);
    return NextResponse.json({ error: 'Failed to fetch vendor' }, { status: 500 });
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

    const allowedFields = ['name', 'email', 'cc_emails', 'phone', 'contact_person', 'trade_category', 'website', 'license', 'notes', 'status'];
    const setClauses: string[] = [];
    const args: (string | null)[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        args.push(body[field]);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    args.push(id);
    const result = await db().execute({
      sql: `UPDATE vendors SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const updated = await db().execute({ sql: 'SELECT * FROM vendors WHERE id = ?', args: [id] });
    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error('Error updating vendor:', error);
    return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    // Soft-delete: set status to 'removed'
    const result = await db().execute({
      sql: "UPDATE vendors SET status = 'removed' WHERE id = ?",
      args: [id],
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 });
  }
}
