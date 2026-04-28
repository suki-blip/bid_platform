import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { sendEmail, getAppUrl } from '@/lib/email';

// POST: Send spec completion request to vendors
// Collects all unique specs from all responses, identifies missing ones per vendor, emails them
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: bidId } = await params;

    const body = await request.json();
    const { spec_keys, vendor_response_ids } = body;
    // spec_keys: string[] — the spec keys to request completion for
    // vendor_response_ids: string[] — which vendor responses to send to (optional, defaults to all)

    if (!spec_keys || !Array.isArray(spec_keys) || spec_keys.length === 0) {
      return NextResponse.json({ error: 'spec_keys required' }, { status: 400 });
    }

    // Get bid info
    const bidResult = await db().execute({
      sql: 'SELECT b.*, p.name as project_name FROM bids b LEFT JOIN projects p ON p.id = b.project_id WHERE b.id = ?',
      args: [bidId],
    });
    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }
    const bid = bidResult.rows[0];

    // Get sender name
    let senderName = '';
    const cookieHeader = request.headers.get('cookie') || '';
    const authMatch = cookieHeader.match(/contractor-auth=([^;]+)/);
    if (authMatch) {
      try { const decoded = JSON.parse(Buffer.from(authMatch[1], 'base64').toString()); senderName = decoded.name || decoded.company || ''; } catch {}
    }

    // Get all responses with proposals and specs
    const responsesResult = await db().execute({
      sql: `SELECT vr.id, vr.vendor_name, vr.vendor_id
            FROM vendor_responses vr
            WHERE vr.bid_id = ?`,
      args: [bidId],
    });

    const targetResponses = vendor_response_ids
      ? responsesResult.rows.filter(r => vendor_response_ids.includes(r.id))
      : responsesResult.rows;

    if (targetResponses.length === 0) {
      return NextResponse.json({ error: 'No vendor responses found' }, { status: 404 });
    }

    const appUrl = getAppUrl();
    let sentCount = 0;

    for (const resp of targetResponses) {
      // Get this vendor's existing specs
      const existingSpecs = await db().execute({
        sql: `SELECT DISTINCT vps.spec_key, vps.spec_value
              FROM vendor_proposal_specs vps
              JOIN vendor_proposals vp ON vp.id = vps.proposal_id
              WHERE vp.response_id = ?`,
        args: [resp.id],
      });
      const existingKeys = new Set(existingSpecs.rows.map(s => (s.spec_key as string).toLowerCase()));

      // Find missing specs for this vendor
      const missingSpecs = spec_keys.filter(k => !existingKeys.has(k.toLowerCase()));

      if (missingSpecs.length === 0) continue; // This vendor has all specs

      // Get vendor email
      let vendorEmail: string | null = null;
      if (resp.vendor_id) {
        const vendorResult = await db().execute({
          sql: 'SELECT email FROM vendors WHERE id = ?',
          args: [resp.vendor_id],
        });
        vendorEmail = vendorResult.rows[0]?.email as string || null;
      }

      // Also check bid_invitations for token
      let submitToken: string | null = null;
      if (resp.vendor_id) {
        const invResult = await db().execute({
          sql: 'SELECT token FROM bid_invitations WHERE bid_id = ? AND vendor_id = ? LIMIT 1',
          args: [bidId, resp.vendor_id],
        });
        submitToken = invResult.rows[0]?.token as string || null;
      }

      if (!vendorEmail) continue;

      // Build spec completion URL
      const specParam = encodeURIComponent(JSON.stringify(missingSpecs));
      const completionUrl = submitToken
        ? `${appUrl}/vendor-submit/${submitToken}?complete_specs=${specParam}&response_id=${resp.id}`
        : `${appUrl}/login?tab=vendor`;

      // Build email with missing specs table
      const specListHtml = missingSpecs.map(k =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e5e0;font-size:13px;font-weight:600;color:#333;">${k}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e5e0;font-size:13px;color:#999;">—</td></tr>`
      ).join('');

      const emailHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#0f0f0f;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
    <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
      <span style="color:#d97706;">Bid</span>Master
    </h1>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e5e5e0;border-top:none;">
    <p style="margin:0 0 16px;font-size:15px;color:#333;">
      Hello <strong>${resp.vendor_name}</strong>,
    </p>

    <p style="font-size:14px;color:#555;line-height:1.6;">
      ${senderName ? `<strong>${senderName}</strong> is requesting` : 'We are requesting'} additional specification details for your bid on <strong>${bid.title}</strong>${bid.project_name ? ` (${bid.project_name})` : ''}.
    </p>

    <p style="font-size:14px;color:#555;margin-bottom:16px;">
      The following specs are missing from your proposal. Please confirm if they are included and provide values:
    </p>

    <table style="width:100%;border-collapse:collapse;border:1.5px solid #e5e5e0;border-radius:8px;overflow:hidden;margin:16px 0;">
      <thead>
        <tr style="background:#fafaf8;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:800;color:#888;text-transform:uppercase;border-bottom:2px solid #e5e5e0;">Specification</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:800;color:#888;text-transform:uppercase;border-bottom:2px solid #e5e5e0;">Your Value</th>
        </tr>
      </thead>
      <tbody>
        ${specListHtml}
      </tbody>
    </table>

    <div style="text-align:center;margin:28px 0;">
      <a href="${completionUrl}" style="display:inline-block;background:#d97706;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
        Complete Your Specs &#8594;
      </a>
    </div>

    <p style="font-size:12px;color:#999;margin-top:16px;">
      You can also reply to this email with the requested information.
    </p>
  </div>
  <div style="background:#fafaf8;border:1px solid #e5e5e0;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#999;">Powered by <strong style="color:#d97706;">BidMaster</strong></p>
  </div>
</div>
</body></html>`;

      await sendEmail({
        to: vendorEmail,
        subject: `Spec completion needed: ${bid.title}${bid.project_name ? ` — ${bid.project_name}` : ''}`,
        html: emailHtml,
      });
      sentCount++;
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      total: targetResponses.length,
    });
  } catch (error) {
    console.error('Error requesting specs:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
