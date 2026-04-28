import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { sendEmail, reminderEmail, getAppUrl } from '@/lib/email';

export async function GET(request: Request) {
  try {
    await dbReady();

    // Optional: verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const firstDays = 5;
    const secondDays = 2;

    const firstTarget = new Date(today);
    firstTarget.setDate(firstTarget.getDate() + firstDays);
    const firstStr = firstTarget.toISOString().split('T')[0];

    const secondTarget = new Date(today);
    secondTarget.setDate(secondTarget.getDate() + secondDays);
    const secondStr = secondTarget.toISOString().split('T')[0];

    const appUrl = getAppUrl();
    let sent = 0;

    // First reminders (5 days before)
    const firstResult = await db().execute({
      sql: `SELECT bi.id as invitation_id, bi.token, b.title as bid_title, b.deadline, v.name as vendor_name, v.email as vendor_email
            FROM bid_invitations bi
            JOIN bids b ON b.id = bi.bid_id
            JOIN vendors v ON v.id = bi.vendor_id
            WHERE b.status = 'active'
              AND substr(b.deadline, 1, 10) = ?
              AND bi.status IN ('pending', 'opened')
              AND bi.id NOT IN (SELECT bid_invitation_id FROM reminder_log WHERE reminder_type = 'first')`,
      args: [firstStr],
    });

    for (const row of firstResult.rows) {
      const email = reminderEmail({
        vendorName: row.vendor_name as string,
        bidTitle: row.bid_title as string,
        deadline: row.deadline as string,
        submitUrl: `${appUrl}/vendor-submit/${row.token}`,
        daysLeft: firstDays,
      });
      const result = await sendEmail({ to: row.vendor_email as string, ...email });
      if (result.success) {
        await db().execute({
          sql: 'INSERT INTO reminder_log (id, bid_invitation_id, reminder_type) VALUES (?, ?, ?)',
          args: [crypto.randomUUID(), row.invitation_id as string, 'first'],
        });
        sent++;
      }
    }

    // Second reminders (2 days before)
    const secondResult = await db().execute({
      sql: `SELECT bi.id as invitation_id, bi.token, b.title as bid_title, b.deadline, v.name as vendor_name, v.email as vendor_email
            FROM bid_invitations bi
            JOIN bids b ON b.id = bi.bid_id
            JOIN vendors v ON v.id = bi.vendor_id
            WHERE b.status = 'active'
              AND substr(b.deadline, 1, 10) = ?
              AND bi.status IN ('pending', 'opened')
              AND bi.id NOT IN (SELECT bid_invitation_id FROM reminder_log WHERE reminder_type = 'second')`,
      args: [secondStr],
    });

    for (const row of secondResult.rows) {
      const email = reminderEmail({
        vendorName: row.vendor_name as string,
        bidTitle: row.bid_title as string,
        deadline: row.deadline as string,
        submitUrl: `${appUrl}/vendor-submit/${row.token}`,
        daysLeft: secondDays,
      });
      const result = await sendEmail({ to: row.vendor_email as string, ...email });
      if (result.success) {
        await db().execute({
          sql: 'INSERT INTO reminder_log (id, bid_invitation_id, reminder_type) VALUES (?, ?, ?)',
          args: [crypto.randomUUID(), row.invitation_id as string, 'second'],
        });
        sent++;
      }
    }

    return NextResponse.json({
      sent,
      today: todayStr,
      first_deadline: firstStr,
      second_deadline: secondStr,
    });
  } catch (error) {
    console.error('Error running reminders:', error);
    return NextResponse.json({ error: 'Failed to run reminders' }, { status: 500 });
  }
}
