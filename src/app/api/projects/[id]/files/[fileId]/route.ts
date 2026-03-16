import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

const contentTypeMap: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
  dwg: 'application/acad',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    await dbReady();
    const { fileId } = await params;

    const result = await db().execute({
      sql: 'SELECT filename, data FROM project_files WHERE id = ?',
      args: [fileId],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const file = result.rows[0];
    const ext = (file.filename as string).split('.').pop()?.toLowerCase() || '';
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Handle various buffer types from libsql
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawData: any = file.data;
    let buffer: ArrayBuffer;
    if (rawData instanceof ArrayBuffer) {
      buffer = rawData;
    } else if (rawData?.buffer instanceof ArrayBuffer) {
      buffer = rawData.buffer;
    } else {
      buffer = rawData as ArrayBuffer;
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${file.filename}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    await dbReady();
    const { fileId } = await params;

    const result = await db().execute({
      sql: 'DELETE FROM project_files WHERE id = ?',
      args: [fileId],
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
