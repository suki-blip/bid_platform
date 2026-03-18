import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { sendEmail, bidInvitationEmail, getAppUrl } from '@/lib/email';

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
    const bidResult = await db().execute({ sql: 'SELECT b.*, p.name as project_name FROM bids b LEFT JOIN projects p ON b.project_id = p.id WHERE b.id = ?', args: [id] });
    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    // Get sender name from cookie
    let senderName = '';
    const cookieHeader = request.headers.get('cookie') || '';
    const authMatch = cookieHeader.match(/contractor-auth=([^;]+)/);
    if (authMatch) {
      try {
        const decoded = JSON.parse(Buffer.from(authMatch[1], 'base64').toString());
        senderName = decoded.name || decoded.company || '';
      } catch {}
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

      // Send invitation email
      const vendorData = await db().execute({ sql: 'SELECT name, email FROM vendors WHERE id = ?', args: [vendorId] });
      if (vendorData.rows.length > 0) {
        const v = vendorData.rows[0];
        const bid = bidResult.rows[0];
        const appUrl = getAppUrl();
        const emailContent = bidInvitationEmail({
          vendorName: v.name as string,
          bidTitle: bid.title as string,
          bidDescription: bid.description as string,
          deadline: bid.deadline as string,
          submitUrl: `${appUrl}/vendor-submit/${token}`,
          portalUrl: `${appUrl}/vendor-login`,
          senderName: senderName || undefined,
          projectName: (bid.project_name as string) || undefined,
        });
        await sendEmail({ to: v.email as string, ...emailContent });
      }
    }

    return NextResponse.json({ created, errors }, { status: 201 });
  } catch (error) {
    console.error('Error creating invitations:', error);
    return NextResponse.json({ error: 'Failed to create invitations' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;
    const { vendor_id, status } = await request.json();

    if (!vendor_id || !status) {
      return NextResponse.json({ error: 'vendor_id and status required' }, { status: 400 });
    }

    await db().execute({
      sql: 'UPDATE bid_invitations SET status = ? WHERE bid_id = ? AND vendor_id = ?',
      args: [status, id, vendor_id],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating invitation:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;
    const { vendor_id } = await request.json();

    if (!vendor_id) {
      return NextResponse.json({ error: 'vendor_id required' }, { status: 400 });
    }

    // Delete invitation
    await db().execute({
      sql: 'DELETE FROM bid_invitations WHERE bid_id = ? AND vendor_id = ?',
      args: [id, vendor_id],
    });

    // Delete any vendor responses
    await db().execute({
      sql: 'DELETE FROM vendor_responses WHERE bid_id = ? AND vendor_id = ?',
      args: [id, vendor_id],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting invitation:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
