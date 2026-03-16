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
      sql: 'SELECT id, filename, uploaded_at FROM project_files WHERE project_id = ? ORDER BY uploaded_at DESC',
      args: [id],
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching project files:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    const projectResult = await db().execute({
      sql: 'SELECT id FROM projects WHERE id = ?',
      args: [id],
    });
    if (projectResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const statements: { sql: string; args: (string | ArrayBuffer)[] }[] = [];
    const fileEntries: { id: string; filename: string }[] = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;

      const fileId = crypto.randomUUID();
      const arrayBuffer = await file.arrayBuffer();

      statements.push({
        sql: 'INSERT INTO project_files (id, project_id, filename, data) VALUES (?, ?, ?, ?)',
        args: [fileId, id, file.name, arrayBuffer],
      });

      fileEntries.push({ id: fileId, filename: file.name });
    }

    if (statements.length > 0) {
      await db().batch(statements, 'write');
    }

    return NextResponse.json(fileEntries, { status: 201 });
  } catch (error) {
    console.error('Error uploading project files:', error);
    return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 });
  }
}
