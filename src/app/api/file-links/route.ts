import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await dbReady();
    const ref_type = request.nextUrl.searchParams.get('ref_type');
    const ref_id = request.nextUrl.searchParams.get('ref_id');

    if (!ref_type || !ref_id) {
      return NextResponse.json({ error: 'ref_type and ref_id required' }, { status: 400 });
    }

    const result = await db().execute({
      sql: 'SELECT * FROM file_links WHERE ref_type = ? AND ref_id = ? ORDER BY created_at DESC',
      args: [ref_type, ref_id],
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching file links:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbReady();
    const { ref_type, ref_id, links } = await request.json();

    if (!ref_type || !ref_id || !links || !Array.isArray(links)) {
      return NextResponse.json({ error: 'ref_type, ref_id, links[] required' }, { status: 400 });
    }

    const created = [];
    for (const link of links) {
      if (!link.url) continue;
      const id = crypto.randomUUID();
      await db().execute({
        sql: 'INSERT INTO file_links (id, ref_type, ref_id, url, label) VALUES (?, ?, ?, ?, ?)',
        args: [id, ref_type, ref_id, link.url, link.label || ''],
      });
      created.push({ id, ref_type, ref_id, url: link.url, label: link.label || '' });
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating file links:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await dbReady();
    const { id, label } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await db().execute({ sql: 'UPDATE file_links SET label = ? WHERE id = ?', args: [label || '', id] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await dbReady();
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await db().execute({ sql: 'DELETE FROM file_links WHERE id = ?', args: [id] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
