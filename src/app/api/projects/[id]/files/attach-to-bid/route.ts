import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import type { InValue } from '@libsql/client';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;
    const body = await request.json();
    const { bid_id, file_ids } = body;

    if (!bid_id || !file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      return NextResponse.json({ error: 'bid_id and file_ids are required' }, { status: 400 });
    }

    // Verify bid exists
    const bidResult = await db().execute({
      sql: 'SELECT id FROM bids WHERE id = ?',
      args: [bid_id],
    });
    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const statements: { sql: string; args: InValue[] }[] = [];
    const copied: { id: string; filename: string }[] = [];

    for (const fileId of file_ids) {
      const fileResult = await db().execute({
        sql: 'SELECT filename, data FROM project_files WHERE id = ? AND project_id = ?',
        args: [fileId, id],
      });
      if (fileResult.rows.length === 0) continue;

      const file = fileResult.rows[0];
      const newId = crypto.randomUUID();

      statements.push({
        sql: 'INSERT INTO bid_files (id, bid_id, filename, data) VALUES (?, ?, ?, ?)',
        args: [newId, bid_id, file.filename, file.data],
      });
      copied.push({ id: newId, filename: file.filename as string });
    }

    if (statements.length > 0) {
      await db().batch(statements, 'write');
    }

    return NextResponse.json({ copied }, { status: 201 });
  } catch (error) {
    console.error('Error attaching project files to bid:', error);
    return NextResponse.json({ error: 'Failed to attach files' }, { status: 500 });
  }
}
