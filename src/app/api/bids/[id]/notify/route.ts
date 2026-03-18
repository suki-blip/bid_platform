import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { sendEmail, getAppUrl } from '@/lib/email';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;
    const { vendor_ids, message, type, pause_days } = await request.json();

    if (!vendor_ids || (Array.isArray(vendor_ids) && vendor_ids.length === 0)) {
      return NextResponse.json({ error: 'vendor_ids required' }, { status: 400 });
    }

    // Get bid info
    const bidResult = await db().execute({
      sql: 'SELECT b.*, p.name as project_name FROM bids b LEFT JOIN projects p ON b.project_id = p.id WHERE b.id = ?',
      args: [id],
    });
    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }
    const bid = bidResult.rows[0] as Record<string, unknown>;

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

    const appUrl = getAppUrl();

    // For files_updated: get vendors from invitations that haven't submitted
    let targetVendors: { vendorId: string; vendorName: string; email: string; token?: string }[] = [];

    if (type === 'files_updated') {
      let vendorFilter = '';
      const qArgs: string[] = [id];
      if (vendor_ids !== 'all' && Array.isArray(vendor_ids)) {
        vendorFilter = ` AND bi.vendor_id IN (${vendor_ids.map(() => '?').join(',')})`;
        qArgs.push(...vendor_ids);
      }
      const invResult = await db().execute({
        sql: `SELECT bi.vendor_id, bi.token, v.name, v.email
              FROM bid_invitations bi
              JOIN vendors v ON v.id = bi.vendor_id
              WHERE bi.bid_id = ?${vendorFilter}
              AND bi.status IN ('pending', 'opened')`,
        args: qArgs,
      });
      targetVendors = invResult.rows.map(r => ({
        vendorId: r.vendor_id as string,
        vendorName: r.name as string,
        email: r.email as string,
        token: r.token as string,
      }));
    } else {
      // Original behavior: vendor_ids is an array of vendor IDs
      const ids = Array.isArray(vendor_ids) ? vendor_ids : [];
      for (const vid of ids) {
        const vr = await db().execute({ sql: 'SELECT id, name, email FROM vendors WHERE id = ?', args: [vid] });
        if (vr.rows.length > 0) {
          targetVendors.push({
            vendorId: vr.rows[0].id as string,
            vendorName: vr.rows[0].name as string,
            email: vr.rows[0].email as string,
          });
        }
      }
    }

    const sent: string[] = [];
    for (const tv of targetVendors) {
      const subject = type === 'files_updated'
        ? `Updated Files: ${bid.title}${bid.project_name ? ` — ${bid.project_name}` : ''}`
        : type === 'bid_paused'
        ? `Bid Update: ${bid.title} - Paused`
        : type === 'bid_cancelled'
        ? `Bid Update: ${bid.title} - Cancelled`
        : `Bid Update: ${bid.title}`;

      let html: string;
      if (type === 'files_updated') {
        const submitUrl = tv.token ? `${appUrl}/vendor-submit/${tv.token}` : `${appUrl}/vendor-login`;
        html = `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background:#fff; border-radius:12px; overflow:hidden; border:1px solid #e5e5e0">
            <div style="background:#1a1a1a; padding:16px 24px;">
              <div style="color:#b8860b; font-weight:800; font-size:18px">BidMaster</div>
            </div>
            <div style="padding:24px">
              <h2 style="color:#0f0f0f; font-size:18px; font-weight:800; margin:0 0 8px">New Files Added</h2>
              <p style="color:#666; font-size:14px; margin:0 0 16px">
                Hi ${tv.vendorName}, new files have been added to the bid <strong>${bid.title}</strong>.
                Please review the updated documents and submit your response.
              </p>
              ${message ? `<div style="background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:14px; margin-bottom:16px; font-size:14px; color:#333">${message}</div>` : ''}
              ${bid.project_name ? `<p style="font-size:13px; color:#888; margin:0 0 4px">Project: <strong style="color:#333">${bid.project_name}</strong></p>` : ''}
              ${senderName ? `<p style="font-size:13px; color:#888; margin:0 0 16px">From: <strong style="color:#333">${senderName}</strong></p>` : ''}
              <div style="text-align:center; margin:20px 0">
                <a href="${submitUrl}" style="display:inline-block; background:#b8860b; color:#fff; padding:12px 32px; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px">
                  Review & Submit →
                </a>
              </div>
            </div>
            <div style="background:#f9f9f6; padding:14px 24px; text-align:center; font-size:11px; color:#999">
              BidMaster — Smart Bid Management
            </div>
          </div>
        `;
      } else {
        html = `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
            <h2 style="color: #0f0f0f;">Bid Update</h2>
            <p>Hi ${tv.vendorName},</p>
            <p>Regarding bid: <strong>${bid.title}</strong></p>
            <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 16px 0;">
              ${message || 'The bid has been updated.'}
            </div>
            ${pause_days ? `<p style="color: #666; font-size: 14px;">Expected duration: ${pause_days} days</p>` : ''}
            <p style="color: #999; font-size: 12px;">— BidMaster</p>
          </div>
        `;
      }

      try {
        await sendEmail({ to: tv.email, subject, html });
        sent.push(tv.vendorId);
      } catch {
        // Email sending may fail in dev
      }

      // Log activity
      await db().execute({
        sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
        args: [
          crypto.randomUUID(),
          'notification',
          `Notification sent to ${tv.vendorName}: ${type || 'update'}`,
        ],
      });
    }

    return NextResponse.json({ sent, total: targetVendors.length });
  } catch (error) {
    console.error('Error sending notifications:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
