import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { sendEmail, getAppUrl } from '@/lib/email';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id } = await params;
    const body = await request.json();
    const notifyVendors = body.notify_vendors; // 'all' | 'none' | string[]
    const message = body.message || '';

    const projResult = await db().execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [id],
    });
    if (projResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Pause project
    await db().execute({
      sql: "UPDATE projects SET status = 'paused' WHERE id = ?",
      args: [id],
    });

    // Pause all active bids
    const pauseResult = await db().execute({
      sql: "UPDATE bids SET status = 'paused' WHERE project_id = ? AND status IN ('active', 'draft')",
      args: [id],
    });

    // Notify vendors
    let notifiedCount = 0;
    if (notifyVendors && notifyVendors !== 'none') {
      const vendorsResult = await db().execute({
        sql: `SELECT DISTINCT v.id, v.name, v.email FROM bid_invitations bi
              JOIN vendors v ON v.id = bi.vendor_id
              JOIN bids b ON b.id = bi.bid_id
              WHERE b.project_id = ?`,
        args: [id],
      });

      const projectName = projResult.rows[0].name as string;
      const appUrl = getAppUrl();

      for (const vendor of vendorsResult.rows) {
        if (notifyVendors !== 'all' && Array.isArray(notifyVendors) && !notifyVendors.includes(vendor.id as string)) {
          continue;
        }
        try {
          await sendEmail({
            to: vendor.email as string,
            subject: `Project Paused: ${projectName}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:#e8920a;padding:16px 24px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;font-size:1.2rem;">BidMaster</h1>
                </div>
                <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
                  <p>Hi ${vendor.name},</p>
                  <p>The project <strong>${projectName}</strong> has been paused.</p>
                  ${message ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:12px 0;font-style:italic;">${message}</div>` : ''}
                  <p>We will notify you when the project resumes.</p>
                  <a href="${appUrl}/vendor-login" style="display:inline-block;background:#e8920a;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:12px;">View Portal</a>
                </div>
              </div>
            `,
          });
          notifiedCount++;
        } catch (e) {
          console.error('Error sending pause notification:', e);
        }
      }
    }

    return NextResponse.json({ success: true, paused_bids: pauseResult.rowsAffected, notified_vendors: notifiedCount });
  } catch (error) {
    console.error('Error pausing project:', error);
    return NextResponse.json({ error: 'Failed to pause project' }, { status: 500 });
  }
}
