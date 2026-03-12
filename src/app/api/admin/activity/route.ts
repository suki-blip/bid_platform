import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  await dbReady();
  const client = db();
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') || '50');
  const offset = Number(url.searchParams.get('offset') || '0');

  const result = await client.execute({
    sql: 'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
    args: [limit, offset],
  });
  const total = await client.execute('SELECT COUNT(*) as count FROM activity_log');

  return NextResponse.json({
    activity: result.rows,
    total: Number(total.rows[0].count),
  });
}
