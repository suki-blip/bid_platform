import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { sendEmail, winnerNotificationEmail, loserNotificationEmail, getAppUrl } from '@/lib/email';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    const result = await db().execute({
      sql: `SELECT bw.*, v.name as vendor_name, v.email as vendor_email
            FROM bid_winners bw
            JOIN vendors v ON v.id = bw.vendor_id
            WHERE bw.bid_id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ winner: null });
    }

    return NextResponse.json({ winner: result.rows[0] });
  } catch (error) {
    console.error('Error fetching winner:', error);
    return NextResponse.json({ error: 'Failed to fetch winner' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    const body = await request.json();
    const { vendor_id, vendor_response_id, notes, winning_combination } = body;

    if (!vendor_id || !vendor_response_id) {
      return NextResponse.json({ error: 'Missing required fields: vendor_id, vendor_response_id' }, { status: 400 });
    }

    // Verify bid exists
    const bidResult = await db().execute({ sql: 'SELECT * FROM bids WHERE id = ?', args: [id] });
    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }
    const bid = bidResult.rows[0];

    // Check not already awarded
    const existingWinner = await db().execute({ sql: 'SELECT * FROM bid_winners WHERE bid_id = ?', args: [id] });
    if (existingWinner.rows.length > 0) {
      return NextResponse.json({ error: 'Bid already has a winner' }, { status: 409 });
    }

    // Create winner record and update bid status
    const winnerId = crypto.randomUUID();
    await db().batch([
      {
        sql: 'INSERT INTO bid_winners (id, bid_id, vendor_id, vendor_response_id, notes, winning_combination) VALUES (?, ?, ?, ?, ?, ?)',
        args: [winnerId, id, vendor_id, vendor_response_id, notes || null, winning_combination || null],
      },
      {
        sql: "UPDATE bids SET status = 'awarded' WHERE id = ?",
        args: [id],
      },
      {
        sql: "UPDATE bid_invitations SET status = 'expired' WHERE bid_id = ? AND status IN ('pending', 'opened')",
        args: [id],
      },
    ], 'write');

    // Send winner email
    const appUrl = getAppUrl();
    const portalUrl = `${appUrl}/vendor-login`;
    const winnerVendor = await db().execute({ sql: 'SELECT * FROM vendors WHERE id = ?', args: [vendor_id] });
    if (winnerVendor.rows.length > 0) {
      const v = winnerVendor.rows[0];
      // Get sender name and project name
      let senderName = '';
      const cookieHeader = request.headers.get('cookie') || '';
      const authMatch = cookieHeader.match(/contractor-auth=([^;]+)/);
      if (authMatch) {
        try { const decoded = JSON.parse(Buffer.from(authMatch[1], 'base64').toString()); senderName = decoded.name || decoded.company || ''; } catch {}
      }
      const projectResult = await db().execute({ sql: 'SELECT p.name FROM projects p JOIN bids b ON b.project_id = p.id WHERE b.id = ?', args: [id] });
      const projectName = projectResult.rows[0]?.name as string || '';

      const email = winnerNotificationEmail({
        vendorName: v.name as string,
        bidTitle: bid.title as string,
        notes: notes || undefined,
        portalUrl,
        winningOption: winning_combination || undefined,
        senderName: senderName || undefined,
        projectName: projectName || undefined,
      });
      await sendEmail({ to: v.email as string, ...email });
    }

    // Send loser emails
    const losers = await db().execute({
      sql: `SELECT DISTINCT v.name, v.email
            FROM bid_invitations bi
            JOIN vendors v ON v.id = bi.vendor_id
            WHERE bi.bid_id = ? AND bi.vendor_id != ? AND bi.status = 'submitted'`,
      args: [id, vendor_id],
    });

    for (const loser of losers.rows) {
      const email = loserNotificationEmail({
        vendorName: loser.name as string,
        bidTitle: bid.title as string,
        portalUrl,
      });
      await sendEmail({ to: loser.email as string, ...email });
    }

    return NextResponse.json({ winner_id: winnerId, bid_status: 'awarded' }, { status: 201 });
  } catch (error) {
    console.error('Error selecting winner:', error);
    return NextResponse.json({ error: 'Failed to select winner' }, { status: 500 });
  }
}
