import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    await dbReady;

    const { id, fileId } = await params;

    const fileResult = await db.execute({
      sql: 'SELECT * FROM bid_files WHERE id = ? AND bid_id = ?',
      args: [fileId, id],
    });
    const file = fileResult.rows[0];

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const extension = (file.filename as string).split('.').pop()?.toLowerCase() || '';
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
      json: 'application/json',
      zip: 'application/zip',
    };

    const contentType = contentTypeMap[extension] || 'application/octet-stream';

    // Handle blob data - use Response with Blob for binary data
    const data = file.data as ArrayBuffer | Buffer;
    const arrayBuffer = data instanceof ArrayBuffer ? data : (data as Buffer).buffer.slice((data as Buffer).byteOffset, (data as Buffer).byteOffset + (data as Buffer).byteLength);
    const blob = new Blob([arrayBuffer], { type: contentType });

    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
