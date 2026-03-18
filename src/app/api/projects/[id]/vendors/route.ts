import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    const result = await db().execute({
      sql: `SELECT DISTINCT v.id, v.name, v.email, v.trade_category
            FROM bid_invitations bi
            JOIN vendors v ON v.id = bi.vendor_id
            JOIN bids b ON b.id = bi.bid_id
            WHERE b.project_id = ?
            ORDER BY v.name`,
      args: [id],
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching project vendors:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
