import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  try {
    await dbReady();
    const result = await db().execute({
      sql: 'SELECT * FROM category_presets ORDER BY name',
      args: [],
    });
    return NextResponse.json(result.rows.map(r => ({
      ...r,
      category_ids: JSON.parse(r.category_ids as string || '[]'),
      vendor_ids: JSON.parse(r.vendor_ids as string || '[]'),
    })));
  } catch (error) {
    console.error('Error fetching presets:', error);
    return NextResponse.json({ error: 'Failed to fetch presets' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbReady();
    const body = await request.json();
    const { name, project_type, category_ids, include_vendors, vendor_ids } = body;

    if (!name || !category_ids || !Array.isArray(category_ids)) {
      return NextResponse.json({ error: 'name and category_ids are required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db().execute({
      sql: `INSERT INTO category_presets (id, name, project_type, category_ids, include_vendors, vendor_ids)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, name, project_type || null, JSON.stringify(category_ids), include_vendors ? 1 : 0, JSON.stringify(vendor_ids || [])],
    });

    const result = await db().execute({ sql: 'SELECT * FROM category_presets WHERE id = ?', args: [id] });
    const row = result.rows[0];
    return NextResponse.json({
      ...row,
      category_ids: JSON.parse(row.category_ids as string),
      vendor_ids: JSON.parse(row.vendor_ids as string),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating preset:', error);
    return NextResponse.json({ error: 'Failed to create preset' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await dbReady();
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    await db().execute({ sql: 'DELETE FROM category_presets WHERE id = ?', args: [id] });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting preset:', error);
    return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 });
  }
}
