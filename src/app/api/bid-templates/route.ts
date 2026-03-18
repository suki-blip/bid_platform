import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  try {
    await dbReady();
    const result = await db().execute({
      sql: 'SELECT * FROM bid_templates ORDER BY created_at DESC',
      args: [],
    });
    return NextResponse.json(result.rows.map(r => ({
      ...r,
      parameters: JSON.parse(r.parameters as string || '[]'),
      checklist: JSON.parse(r.checklist as string || '[]'),
    })));
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbReady();
    const body = await request.json();
    const { name, category_id, title, description, parameters, checklist } = body;

    if (!name || !title || !description) {
      return NextResponse.json({ error: 'name, title, description required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db().execute({
      sql: 'INSERT INTO bid_templates (id, name, category_id, title, description, parameters, checklist) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [
        id,
        name,
        category_id || null,
        title,
        description,
        JSON.stringify(parameters || []),
        JSON.stringify(checklist || []),
      ],
    });

    return NextResponse.json({ id, name, category_id, title, description, parameters, checklist }, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await dbReady();
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await db().execute({ sql: 'DELETE FROM bid_templates WHERE id = ?', args: [id] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
