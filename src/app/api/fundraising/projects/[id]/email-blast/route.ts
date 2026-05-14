import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { sendFundraisingEmail } from '@/lib/fundraising-email';

// POST /api/fundraising/projects/[id]/email-blast
//
// Send a custom email to a set of recipients related to this campaign.
//
// Body: {
//   recipients: 'all_donors' | 'campaign_donors' | 'campaign_prospects' | 'open_pledgers',
//   subject: string,
//   html: string,
//   include_opt_out?: false,   // by default we skip donors who opted out (email_opt_in='none')
// }
//
// Returns { sent: number, skipped: number, failed: number, errors?: string[] }
//
// Throttle: we serialise sends to ~10/sec to play nicely with Resend's per-second limit.
// For larger batches the user should still use Resend's own bulk send or our future
// queue — but for typical campaign sizes (<200 donors) this is fine in a single request.

type RecipientKind = 'all_donors' | 'campaign_donors' | 'campaign_prospects' | 'open_pledgers';

interface BlastBody {
  recipients?: RecipientKind;
  subject?: string;
  html?: string;
  include_opt_out?: boolean;
}

async function pickRecipients(
  ownerId: string,
  projectId: string,
  kind: RecipientKind,
  includeOptOut: boolean,
): Promise<{ id: string; first_name: string; last_name: string | null; hebrew_name: string | null; email: string }[]> {
  const optOutFilter = includeOptOut ? "" : " AND COALESCE(email_opt_in, 'all') = 'all'";

  let sql: string;
  let args: (string | number)[];

  if (kind === 'all_donors') {
    sql = `SELECT id, first_name, last_name, hebrew_name, email FROM fr_donors
           WHERE owner_id = ? AND status = 'donor' AND email IS NOT NULL AND email != ''${optOutFilter}`;
    args = [ownerId];
  } else if (kind === 'campaign_donors') {
    // Donors who have any pledge (real, not standalone) tied to this project.
    sql = `SELECT DISTINCT d.id, d.first_name, d.last_name, d.hebrew_name, d.email
           FROM fr_donors d
           JOIN fr_pledges pl ON pl.donor_id = d.id
           WHERE d.owner_id = ? AND pl.project_id = ? AND COALESCE(pl.is_standalone, 0) = 0
             AND d.email IS NOT NULL AND d.email != ''${optOutFilter.replace('email_opt_in', 'd.email_opt_in')}`;
    args = [ownerId, projectId];
  } else if (kind === 'campaign_prospects') {
    sql = `SELECT DISTINCT d.id, d.first_name, d.last_name, d.hebrew_name, d.email
           FROM fr_donors d
           JOIN fr_project_prospects pp ON pp.donor_id = d.id
           WHERE pp.owner_id = ? AND pp.project_id = ?
             AND d.email IS NOT NULL AND d.email != ''${optOutFilter.replace('email_opt_in', 'd.email_opt_in')}`;
    args = [ownerId, projectId];
  } else if (kind === 'open_pledgers') {
    sql = `SELECT DISTINCT d.id, d.first_name, d.last_name, d.hebrew_name, d.email
           FROM fr_donors d
           JOIN fr_pledges pl ON pl.donor_id = d.id
           WHERE d.owner_id = ? AND pl.project_id = ? AND pl.status = 'open'
             AND COALESCE(pl.is_standalone, 0) = 0
             AND d.email IS NOT NULL AND d.email != ''${optOutFilter.replace('email_opt_in', 'd.email_opt_in')}`;
    args = [ownerId, projectId];
  } else {
    return [];
  }

  const r = await db().execute({ sql, args });
  return r.rows.map((row) => ({
    id: String(row.id),
    first_name: String(row.first_name || ''),
    last_name: (row.last_name as string | null) || null,
    hebrew_name: (row.hebrew_name as string | null) || null,
    email: String(row.email || ''),
  }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Only managers can send blasts' }, { status: 403 });
  await dbReady();
  const { id: projectId } = await params;

  const body = (await request.json().catch(() => ({}))) as BlastBody;
  const kind: RecipientKind = (body.recipients || 'campaign_donors') as RecipientKind;
  const subject = (body.subject || '').trim();
  const html = (body.html || '').trim();
  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!html) return NextResponse.json({ error: 'Body is required' }, { status: 400 });

  const recipients = await pickRecipients(session.ownerId, projectId, kind, !!body.include_opt_out);
  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0, total: 0, errors: ['No recipients matched.'] });
  }

  // Per-recipient personalisation: replace {{first_name}}, {{hebrew_name}}, {{full_name}} in
  // subject and body. Keeps the template flexible without a full template engine.
  function personalise(template: string, r: typeof recipients[number]): string {
    const fullName = `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`.trim();
    return template
      .replace(/\{\{first_name\}\}/g, r.first_name)
      .replace(/\{\{last_name\}\}/g, r.last_name || '')
      .replace(/\{\{full_name\}\}/g, fullName)
      .replace(/\{\{hebrew_name\}\}/g, r.hebrew_name || '');
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  // Serial sends with a small delay to stay under Resend's 10 req/s default rate.
  for (const r of recipients) {
    const result = await sendFundraisingEmail({
      ownerId: session.ownerId,
      to: r.email,
      subject: personalise(subject, r),
      html: personalise(html, r),
      template: 'campaign_blast',
      donorId: r.id,
      projectId,
    });
    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (errors.length < 10) errors.push(`${r.email}: ${result.error}`);
    }
    // Small delay to stay under Resend's rate limit
    await new Promise((res) => setTimeout(res, 110));
  }

  return NextResponse.json({
    sent,
    failed,
    skipped: 0,
    total: recipients.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
