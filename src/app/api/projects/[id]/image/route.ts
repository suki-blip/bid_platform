import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// POST: Upload project image (base64 stored in DB)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Max 2MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be under 2MB' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    await db().execute({
      sql: 'UPDATE projects SET image_url = ? WHERE id = ?',
      args: [dataUrl, id],
    });

    return NextResponse.json({ success: true, image_url: dataUrl });
  } catch (error) {
    console.error('Error uploading project image:', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

// DELETE: Remove project image
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    await db().execute({
      sql: 'UPDATE projects SET image_url = NULL WHERE id = ?',
      args: [id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing project image:', error);
    return NextResponse.json({ error: 'Failed to remove image' }, { status: 500 });
  }
}
