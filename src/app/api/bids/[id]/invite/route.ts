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
      sql: `SELECT bi.*, v.name as vendor_name, v.email as vendor_email
            FROM bid_invitations bi
            JOIN vendors v ON v.id = bi.vendor_id
            WHERE bi.bid_id = ?
            ORDER BY bi.sent_at DESC`,
      args: [id],
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    // Verify bid exists and is active
    const bidResult = await db().execute({ sql: 'SELECT * FROM bids WHERE id = ?', args: [id] });
    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const body = await request.json();
    const { vendor_ids } = body;

    if (!vendor_ids || !Array.isArray(vendor_ids) || vendor_ids.length === 0) {
      return NextResponse.json({ error: 'Missing required field: vendor_ids (array)' }, { status: 400 });
    }

    const created: { vendor_id: string; token: string }[] = [];
    const errors: { vendor_id: string; reason: string }[] = [];

    for (const vendorId of vendor_ids) {
      // Check vendor exists
      const vendorResult = await db().execute({ sql: 'SELECT id FROM vendors WHERE id = ?', args: [vendorId] });
      if (vendorResult.rows.length === 0) {
        errors.push({ vendor_id: vendorId, reason: 'Vendor not found' });
        continue;
      }

      // Check if already invited
      const existing = await db().execute({
        sql: 'SELECT id FROM bid_invitations WHERE bid_id = ? AND vendor_id = ?',
        args: [id, vendorId],
      });
      if (existing.rows.length > 0) {
        errors.push({ vendor_id: vendorId, reason: 'Already invited' });
        continue;
      }

      const invId = crypto.randomUUID();
      const token = crypto.randomUUID();

      await db().execute({
        sql: 'INSERT INTO bid_invitations (id, bid_id, vendor_id, token) VALUES (?, ?, ?, ?)',
        args: [invId, id, vendorId, token],
      });

      created.push({ vendor_id: vendorId, token });
    }

    return NextResponse.json({ created, errors }, { status: 201 });
  } catch (error) {
    console.error('Error creating invitations:', error);
    return NextResponse.json({ error: 'Failed to create invitations' }, { status: 500 });
  }
}
