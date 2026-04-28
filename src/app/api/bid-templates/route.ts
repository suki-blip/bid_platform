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
      is_default: r.is_default === 1,
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

export async function PATCH(request: Request) {
  try {
    await dbReady();
    const body = await request.json();
    const { id, name, category_id, title, description, parameters, checklist, bid_mode, suggested_specs } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const sets: string[] = [];
    const args: any[] = [];
    if (name !== undefined) { sets.push('name = ?'); args.push(name); }
    if (category_id !== undefined) { sets.push('category_id = ?'); args.push(category_id || null); }
    if (title !== undefined) { sets.push('title = ?'); args.push(title); }
    if (description !== undefined) { sets.push('description = ?'); args.push(description); }
    if (parameters !== undefined) { sets.push('parameters = ?'); args.push(JSON.stringify(parameters)); }
    if (checklist !== undefined) { sets.push('checklist = ?'); args.push(JSON.stringify(checklist)); }
    if (bid_mode !== undefined) { sets.push('bid_mode = ?'); args.push(bid_mode); }
    if (suggested_specs !== undefined) { sets.push('suggested_specs = ?'); args.push(JSON.stringify(suggested_specs)); }

    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    args.push(id);
    await db().execute({ sql: `UPDATE bid_templates SET ${sets.join(', ')} WHERE id = ?`, args });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating template:', error);
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
