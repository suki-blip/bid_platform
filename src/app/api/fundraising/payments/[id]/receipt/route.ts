import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { sendFundraisingEmail, resolveReceiptEmail } from '@/lib/fundraising-email';
import { fmtMethod } from '@/lib/fundraising-format';

// POST /api/fundraising/payments/[id]/receipt
//
// Manually (re)send the receipt for a payment. Body: { to? } — defaults to the donor's
// primary email; the caller may override.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id: paymentId } = await params;

  const body = (await request.json().catch(() => ({}))) as { to?: string };

  // Pull the payment + donor + project. Owner-scoped via the pledge owner_id (payments
  // don't have owner_id directly).
  const r = await db().execute({
    sql: `SELECT pp.id, pp.amount, pp.method, pp.paid_date, pp.due_date,
                 pp.transaction_ref, pp.cc_last4, pp.status,
                 d.id AS donor_id, d.first_name, d.last_name, d.hebrew_name, d.email,
                 d.email_opt_in,
                 prj.name AS project_name, prj.id AS project_id,
                 u.email_from
          FROM fr_pledge_payments pp
          JOIN fr_donors d ON d.id = pp.donor_id
          JOIN saas_users u ON u.id = d.owner_id
          LEFT JOIN fr_projects prj ON prj.id = pp.project_id
          WHERE pp.id = ? AND d.owner_id = ?`,
    args: [paymentId, session.ownerId],
  });
  if (r.rows.length === 0) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  const p = r.rows[0];

  if (String(p.status) !== 'paid') {
    return NextResponse.json(
      { error: `Cannot send receipt — this payment is ${p.status}, not paid.` },
      { status: 400 },
    );
  }

  const donorEmail = (p.email as string | null) || null;
  const toAddr = (body.to || donorEmail || '').trim();
  if (!toAddr || !toAddr.includes('@')) {
    return NextResponse.json({ error: 'No email address on file for this donor.' }, { status: 400 });
  }

  // Pull org name out of the saas_users.email_from display segment.
  let orgName = 'Our organization';
  const efrom = (p.email_from as string | null) || '';
  const m = efrom.match(/^([^<]+)<.+>$/);
  if (m) orgName = m[1].trim();

  // resolveReceiptEmail picks the owner's saved receipt template if any, otherwise falls
  // back to the built-in HTML. Either way the return shape (subject/html/text) is the same.
  const tpl = await resolveReceiptEmail(session.ownerId, {
    donor_name: `${String(p.first_name || '')} ${String(p.last_name || '')}`.trim() || 'Donor',
    first_name: (p.first_name as string | null) || null,
    last_name: (p.last_name as string | null) || null,
    hebrew_name: (p.hebrew_name as string | null) || null,
    amount: Number(p.amount),
    currency: 'USD',
    paid_date: String(p.paid_date || p.due_date || new Date().toISOString().slice(0, 10)),
    method: fmtMethod(String(p.method)),
    project_name: (p.project_name as string | null) || null,
    transaction_ref: (p.transaction_ref as string | null) || null,
    cc_last4: (p.cc_last4 as string | null) || null,
    organization_name: orgName,
  });

  const result = await sendFundraisingEmail({
    ownerId: session.ownerId,
    to: toAddr,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    template: 'receipt',
    donorId: String(p.donor_id),
    paymentId,
    projectId: (p.project_id as string | null) || null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || 'Send failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message_id: result.resend_message_id, to: toAddr });
}
