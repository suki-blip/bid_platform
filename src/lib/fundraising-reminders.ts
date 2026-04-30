import crypto from 'crypto';
import { db } from './db';

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

interface ReminderInsert {
  id: string;
  owner_id: string;
  donor_id: string;
  to_email: string;
  subject: string;
  body: string;
  send_at: string;
  payment_id: string;
}

function buildReminder(args: {
  fullName: string;
  amount: number;
  dueDate: string;
  installmentNumber: number;
  installmentsTotal: number;
  projectName: string | null;
  signoff: string;
}): { subject: string; body: string } {
  const niceDate = new Date(args.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const installLine = args.installmentsTotal > 1
    ? `installment #${args.installmentNumber} of ${args.installmentsTotal}`
    : 'pledge';
  const subject = `Friendly reminder: ${fmtMoney(args.amount)} ${installLine} due ${niceDate}`;
  const body = [
    `Dear ${args.fullName},`,
    '',
    `This is a friendly reminder that your ${installLine} of ${fmtMoney(args.amount)}${args.projectName ? ` for ${args.projectName}` : ''} is scheduled for ${niceDate}.`,
    '',
    'Thank you for your continued support — your generosity directly powers our talmidim and our community.',
    '',
    'If you have any questions or need to update your payment method, please reply to this email or call the office.',
    '',
    args.signoff,
  ].join('\n');
  return { subject, body };
}

export async function queueUpcomingReminders(
  ownerId: string | null,
  leadDays = 7,
  signoff = 'With gratitude,\nThe Yeshiva Office',
): Promise<{ queued: number; skipped: number }> {
  const today = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + leadDays);
  const todayIso = today.toISOString().slice(0, 10);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const ownerFilter = ownerId ? ' AND d.owner_id = ?' : '';
  const args: (string | number)[] = [todayIso, horizonIso];
  if (ownerId) args.push(ownerId);

  // Single SELECT joined with fr_email_queue on payment_id — rows with an existing reminder have q.id IS NOT NULL.
  const rows = await db().execute({
    sql: `SELECT
            pp.id AS payment_id, pp.amount, pp.due_date, pp.installment_number,
            pl.installments_total,
            d.id AS donor_id, d.first_name AS donor_first, d.last_name AS donor_last, d.email AS donor_email,
            d.owner_id, d.do_not_contact,
            prj.name AS project_name,
            q.id AS existing_queue_id
          FROM fr_pledge_payments pp
          JOIN fr_pledges pl ON pl.id = pp.pledge_id
          JOIN fr_donors d ON d.id = pp.donor_id
          LEFT JOIN fr_projects prj ON prj.id = pp.project_id
          LEFT JOIN fr_email_queue q
            ON q.payment_id = pp.id AND q.status IN ('scheduled','sent')
          WHERE pp.status = 'scheduled'
            AND pp.due_date >= ?
            AND pp.due_date <= ?${ownerFilter}
          LIMIT 5000`,
    args,
  });

  const inserts: ReminderInsert[] = [];
  let skipped = 0;

  for (const row of rows.rows) {
    if (row.existing_queue_id) {
      skipped++;
      continue;
    }
    if (Number(row.do_not_contact) === 1 || !row.donor_email) {
      skipped++;
      continue;
    }

    const fullName = `${row.donor_first}${row.donor_last ? ' ' + row.donor_last : ''}`;
    const { subject, body } = buildReminder({
      fullName,
      amount: Number(row.amount),
      dueDate: String(row.due_date),
      installmentNumber: Number(row.installment_number),
      installmentsTotal: Number(row.installments_total),
      projectName: row.project_name ? String(row.project_name) : null,
      signoff,
    });

    const sendAt = new Date(String(row.due_date));
    sendAt.setDate(sendAt.getDate() - leadDays);
    sendAt.setHours(9, 0, 0, 0);

    inserts.push({
      id: crypto.randomUUID(),
      owner_id: String(row.owner_id),
      donor_id: String(row.donor_id),
      to_email: String(row.donor_email),
      subject,
      body,
      send_at: sendAt.toISOString(),
      payment_id: String(row.payment_id),
    });
  }

  if (inserts.length > 0) {
    const stmts = inserts.map((r) => ({
      sql: `INSERT INTO fr_email_queue
              (id, owner_id, donor_id, project_id, to_email, cc, subject, body, send_at, status, created_by, payment_id)
            VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, 'scheduled', 'system-reminder', ?)`,
      args: [r.id, r.owner_id, r.donor_id, r.to_email, r.subject, r.body, r.send_at, r.payment_id],
    }));
    await db().batch(stmts, 'write');
  }

  return { queued: inserts.length, skipped };
}
