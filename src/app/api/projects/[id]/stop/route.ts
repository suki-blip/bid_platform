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
    const notifyVendors = body.notify_vendors; // 'all' | 'none' | string[] of vendor_ids

    // Verify project exists
    const projResult = await db().execute({
      sql: 'SELECT * FROM projects WHERE id = ?',
      args: [id],
    });
    if (projResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Close project
    await db().execute({
      sql: "UPDATE projects SET status = 'closed' WHERE id = ?",
      args: [id],
    });

    // Close all active/draft bids
    const closeResult = await db().execute({
      sql: "UPDATE bids SET status = 'closed' WHERE project_id = ? AND status IN ('active', 'draft')",
      args: [id],
    });

    // Get vendors to notify
    let notifiedCount = 0;
    if (notifyVendors && notifyVendors !== 'none') {
      const vendorsResult = await db().execute({
        sql: `SELECT DISTINCT v.id, v.name, v.email FROM bid_invitations bi
              JOIN vendors v ON v.id = bi.vendor_id
              JOIN bids b ON b.id = bi.bid_id
              WHERE b.project_id = ? AND bi.status IN ('pending', 'opened', 'submitted')`,
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
            subject: `Project Update: ${projectName}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:#e8920a;padding:16px 24px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;font-size:1.2rem;">BidMaster</h1>
                </div>
                <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
                  <p>Hi ${vendor.name},</p>
                  <p>The project <strong>${projectName}</strong> has been closed. All associated bid requests have been closed.</p>
                  <p>Thank you for your participation.</p>
                  <a href="${appUrl}/vendor-login" style="display:inline-block;background:#e8920a;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:12px;">View in Portal</a>
                </div>
              </div>
            `,
          });
          notifiedCount++;
        } catch (e) {
          console.error('Error sending stop notification:', e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      closed_bids: closeResult.rowsAffected,
      notified_vendors: notifiedCount,
    });
  } catch (error) {
    console.error('Error stopping project:', error);
    return NextResponse.json({ error: 'Failed to stop project' }, { status: 500 });
  }
}
