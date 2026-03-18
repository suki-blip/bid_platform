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

    // Resume project
    await db().execute({
      sql: "UPDATE projects SET status = 'active' WHERE id = ?",
      args: [id],
    });

    // Reactivate paused bids
    const resumeResult = await db().execute({
      sql: "UPDATE bids SET status = 'active' WHERE project_id = ? AND status = 'paused'",
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
            subject: `Project Resumed: ${projectName}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                <div style="background:#e8920a;padding:16px 24px;border-radius:10px 10px 0 0;">
                  <h1 style="color:#fff;margin:0;font-size:1.2rem;">BidMaster</h1>
                </div>
                <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
                  <p>Hi ${vendor.name},</p>
                  <p>The project <strong>${projectName}</strong> is back active!</p>
                  ${message ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin:12px 0;">${message}</div>` : ''}
                  <p>You can now submit or update your bids.</p>
                  <a href="${appUrl}/vendor-login" style="display:inline-block;background:#e8920a;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:12px;">Submit Bids</a>
                </div>
              </div>
            `,
          });
          notifiedCount++;
        } catch (e) {
          console.error('Error sending resume notification:', e);
        }
      }
    }

    return NextResponse.json({ success: true, resumed_bids: resumeResult.rowsAffected, notified_vendors: notifiedCount });
  } catch (error) {
    console.error('Error resuming project:', error);
    return NextResponse.json({ error: 'Failed to resume project' }, { status: 500 });
  }
}
