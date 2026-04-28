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
    const {
      vendor_id,
      vendor_response_id,
      notes,
      winning_combination,
      winning_proposal_name,
      notify_winner = true,
      notify_losers = true,
      notify_clerk = false,
      clerk_email,
      clerk_message,
    } = body;

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
        args: [winnerId, id, vendor_id, vendor_response_id, notes || null, winning_combination || winning_proposal_name || null],
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

    const appUrl = getAppUrl();
    const portalUrl = `${appUrl}/login?tab=vendor`;

    // Get sender info
    let senderName = '';
    const cookieHeader = request.headers.get('cookie') || '';
    const authMatch = cookieHeader.match(/contractor-auth=([^;]+)/);
    if (authMatch) {
      try { const decoded = JSON.parse(Buffer.from(authMatch[1], 'base64').toString()); senderName = decoded.name || decoded.company || ''; } catch {}
    }

    const projectResult = await db().execute({ sql: 'SELECT p.name FROM projects p JOIN bids b ON b.project_id = p.id WHERE b.id = ?', args: [id] });
    const projectName = projectResult.rows[0]?.name as string || '';

    // Send winner email
    if (notify_winner) {
      const winnerVendor = await db().execute({ sql: 'SELECT * FROM vendors WHERE id = ?', args: [vendor_id] });
      if (winnerVendor.rows.length > 0) {
        const v = winnerVendor.rows[0];
        const email = winnerNotificationEmail({
          vendorName: v.name as string,
          bidTitle: bid.title as string,
          notes: notes || undefined,
          portalUrl,
          winningOption: winning_combination || winning_proposal_name || undefined,
          senderName: senderName || undefined,
          projectName: projectName || undefined,
        });
        await sendEmail({ to: v.email as string, ...email });
      }
    }

    // Send loser emails
    if (notify_losers) {
      const losers = await db().execute({
        sql: `SELECT DISTINCT v.name, v.email
              FROM bid_invitations bi
              JOIN vendors v ON v.id = bi.vendor_id
              WHERE bi.bid_id = ? AND bi.vendor_id != ? AND bi.status = 'submitted'`,
        args: [id, vendor_id],
      });

      // Also get manual responses (vendors without invitations)
      const manualLosers = await db().execute({
        sql: `SELECT DISTINCT vr.vendor_name as name, v.email
              FROM vendor_responses vr
              LEFT JOIN vendors v ON v.id = vr.vendor_id
              WHERE vr.bid_id = ? AND vr.vendor_id != ? AND vr.vendor_id IS NOT NULL AND v.email IS NOT NULL`,
        args: [id, vendor_id],
      });

      const allLosers = [...losers.rows, ...manualLosers.rows];
      const sentEmails = new Set<string>();

      for (const loser of allLosers) {
        const loserEmail = loser.email as string;
        if (!loserEmail || sentEmails.has(loserEmail)) continue;
        sentEmails.add(loserEmail);

        const email = loserNotificationEmail({
          vendorName: loser.name as string,
          bidTitle: bid.title as string,
          portalUrl,
          senderName: senderName || undefined,
          projectName: projectName || undefined,
        });
        await sendEmail({ to: loserEmail, ...email });
      }
    }

    // Send clerk/office notification
    if (notify_clerk && clerk_email) {
      const winnerVendor = await db().execute({ sql: 'SELECT name, email, phone, contact_person FROM vendors WHERE id = ?', args: [vendor_id] });
      const v = winnerVendor.rows[0] || {};

      const clerkHtml = `
        <p style="margin: 0 0 16px; font-size: 15px; color: #333;">A vendor has been selected as the winner for a bid.</p>

        <div style="background: #fafaf8; border: 1.5px solid #e5e5e0; border-left: 4px solid #d97706; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h2 style="margin: 0 0 12px; font-size: 17px; font-weight: 800; color: #0f0f0f;">${bid.title}</h2>
          ${projectName ? `<p style="margin: 0 0 8px; font-size: 13px; color: #666;">Project: <strong>${projectName}</strong></p>` : ''}
          <div style="border-top: 1px solid #e5e5e0; padding-top: 12px; margin-top: 12px;">
            <div style="font-size: 11px; font-weight: 800; color: #d97706; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Selected Vendor</div>
            <p style="margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0f0f0f;">${v.name || 'Unknown'}</p>
            ${v.email ? `<p style="margin: 0 0 2px; font-size: 13px; color: #555;">Email: ${v.email}</p>` : ''}
            ${v.phone ? `<p style="margin: 0 0 2px; font-size: 13px; color: #555;">Phone: ${v.phone}</p>` : ''}
            ${v.contact_person ? `<p style="margin: 0 0 2px; font-size: 13px; color: #555;">Contact: ${v.contact_person}</p>` : ''}
            ${(winning_combination || winning_proposal_name) ? `<p style="margin: 8px 0 0; font-size: 13px; color: #d97706; font-weight: 600;">Option: ${winning_combination || winning_proposal_name}</p>` : ''}
          </div>
        </div>

        ${notes ? `
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin: 16px 0;">
            <div style="font-size: 11px; font-weight: 700; color: #166534; margin-bottom: 4px;">Notes</div>
            <p style="margin: 0; font-size: 13px; color: #333;">${notes}</p>
          </div>
        ` : ''}

        ${clerk_message ? `
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin: 16px 0;">
            <div style="font-size: 11px; font-weight: 700; color: #1e40af; margin-bottom: 4px;">Message</div>
            <p style="margin: 0; font-size: 13px; color: #333;">${clerk_message}</p>
          </div>
        ` : ''}

        <p style="font-size: 13px; color: #555; margin-top: 20px;">
          ${senderName ? `Selected by <strong>${senderName}</strong>` : 'Selected'} on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      `;

      // Use the email wrapper from the email module indirectly
      await sendEmail({
        to: clerk_email,
        subject: `Winner Selected: ${bid.title}${projectName ? ` — ${projectName}` : ''}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; background: #f5f5f3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #0f0f0f; border-radius: 12px 12px 0 0; padding: 24px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px;">
                <span style="color: #d97706;">Bid</span>Master
              </h1>
            </div>
            <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e5e0; border-top: none;">
              ${clerkHtml}
            </div>
            <div style="background: #fafaf8; border: 1px solid #e5e5e0; border-top: none; border-radius: 0 0 12px 12px; padding: 16px 32px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #999;">
                Powered by <strong style="color: #d97706;">BidMaster</strong>
              </p>
            </div>
          </div>
        </body></html>`,
      });
    }

    return NextResponse.json({ winner_id: winnerId, bid_status: 'awarded' }, { status: 201 });
  } catch (error) {
    console.error('Error selecting winner:', error);
    return NextResponse.json({ error: 'Failed to select winner' }, { status: 500 });
  }
}

// DELETE: Cancel/undo winner selection
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;

    const existing = await db().execute({ sql: 'SELECT * FROM bid_winners WHERE bid_id = ?', args: [id] });
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'No winner found for this bid' }, { status: 404 });
    }

    await db().batch([
      { sql: 'DELETE FROM bid_winners WHERE bid_id = ?', args: [id] },
      { sql: "UPDATE bids SET status = 'active' WHERE id = ?", args: [id] },
    ], 'write');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling winner:', error);
    return NextResponse.json({ error: 'Failed to cancel winner' }, { status: 500 });
  }
}
