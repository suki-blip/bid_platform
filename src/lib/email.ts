const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'BidMaster <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set, skipping email:', subject, '->', to);
    return { success: true }; // Silently succeed in dev
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[email] Failed to send:', data);
      return { success: false, error: data.message || `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] Error:', msg);
    return { success: false, error: msg };
  }
}

export function getAppUrl(): string {
  return APP_URL;
}

// --- Shared email wrapper ---
function emailWrapper(content: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f5f5f3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: #0f0f0f; border-radius: 12px 12px 0 0; padding: 24px 32px; text-align: center;">
      <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px;">
        <span style="color: #d97706;">Bid</span>Master
      </h1>
    </div>
    <!-- Body -->
    <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e5e0; border-top: none;">
      ${content}
    </div>
    <!-- Footer -->
    <div style="background: #fafaf8; border: 1px solid #e5e5e0; border-top: none; border-radius: 0 0 12px 12px; padding: 16px 32px; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: #999;">
        Powered by <strong style="color: #d97706;">BidMaster</strong> — Smart Bid Management for Contractors
      </p>
    </div>
  </div>
</body>
</html>`;
}

function goldButton(text: string, url: string) {
  return `<a href="${url}" style="display: inline-block; background: #d97706; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; letter-spacing: -0.3px;">${text}</a>`;
}

// --- Email Templates ---

export function bidInvitationEmail(vars: {
  vendorName: string;
  bidTitle: string;
  bidDescription: string;
  deadline: string;
  submitUrl: string;
  portalUrl: string;
  senderName?: string;
  projectName?: string;
}) {
  const deadlineStr = new Date(vars.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const daysLeft = Math.ceil((new Date(vars.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return {
    subject: `Bid Invitation: ${vars.bidTitle}${vars.projectName ? ` — ${vars.projectName}` : ''}`,
    html: emailWrapper(`
      <p style="margin: 0 0 20px; font-size: 15px; color: #333;">
        Hello <strong>${vars.vendorName}</strong>,
      </p>

      ${vars.senderName ? `
        <p style="margin: 0 0 16px; font-size: 14px; color: #555;">
          <strong>${vars.senderName}</strong> has invited you to submit a bid${vars.projectName ? ` for project <strong>${vars.projectName}</strong>` : ''}.
        </p>
      ` : `
        <p style="margin: 0 0 16px; font-size: 14px; color: #555;">
          You have been invited to submit a bid${vars.projectName ? ` for project <strong>${vars.projectName}</strong>` : ''}.
        </p>
      `}

      <!-- Bid card -->
      <div style="background: #fafaf8; border: 1.5px solid #e5e5e0; border-left: 4px solid #d97706; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h2 style="margin: 0 0 8px; font-size: 17px; font-weight: 800; color: #0f0f0f;">${vars.bidTitle}</h2>
        <p style="margin: 0 0 12px; color: #666; font-size: 13px; line-height: 1.5; white-space: pre-line;">${vars.bidDescription.substring(0, 200)}${vars.bidDescription.length > 200 ? '...' : ''}</p>
        <div style="display: flex; gap: 20px; font-size: 13px;">
          <div>
            <span style="color: #999;">Deadline</span><br>
            <strong style="color: #0f0f0f;">${deadlineStr}</strong>
          </div>
          <div>
            <span style="color: ${daysLeft <= 5 ? '#c00' : '#999'};">${daysLeft > 0 ? `${daysLeft} days remaining` : 'Deadline passed'}</span>
          </div>
        </div>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        ${goldButton('Submit Your Bid \u2192', vars.submitUrl)}
      </div>

      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e5e0;">
        <p style="font-size: 12px; color: #999; margin: 0 0 4px;">
          No account needed — click the button above and enter your pricing directly.
        </p>
        <p style="font-size: 12px; color: #999; margin: 0;">
          <a href="${vars.portalUrl}" style="color: #d97706; text-decoration: none;">Already have a portal account? Log in here \u2192</a>
        </p>
      </div>
    `),
  };
}

export function winnerNotificationEmail(vars: {
  vendorName: string;
  bidTitle: string;
  notes?: string;
  portalUrl: string;
  winningOption?: string;
  senderName?: string;
  projectName?: string;
}) {
  return {
    subject: `\uD83C\uDFC6 You won: ${vars.bidTitle}`,
    html: emailWrapper(`
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background: #fef9c3; border-radius: 50%; width: 56px; height: 56px; line-height: 56px; font-size: 28px;">
          \uD83C\uDFC6
        </div>
      </div>

      <h2 style="text-align: center; margin: 0 0 8px; font-size: 20px; font-weight: 800; color: #0f0f0f;">
        Congratulations, ${vars.vendorName}!
      </h2>

      <p style="text-align: center; font-size: 14px; color: #555; margin: 0 0 24px;">
        ${vars.senderName ? `<strong>${vars.senderName}</strong> has selected` : 'You have been selected as'} the winner for <strong>${vars.bidTitle}</strong>${vars.projectName ? ` (${vars.projectName})` : ''}.
      </p>

      ${vars.winningOption ? `
        <div style="background: #fef9c3; border: 1.5px solid #fde68a; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
          <div style="font-size: 11px; font-weight: 800; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Winning Option</div>
          <div style="font-size: 15px; font-weight: 700; color: #0f0f0f;">${vars.winningOption}</div>
        </div>
      ` : ''}

      ${vars.notes ? `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin: 16px 0;">
          <p style="margin: 0; font-size: 13px; color: #333;">${vars.notes}</p>
        </div>
      ` : ''}

      <p style="font-size: 14px; color: #555;">The contractor will be in touch with next steps.</p>

      <div style="text-align: center; margin: 24px 0;">
        ${goldButton('View in Portal \u2192', vars.portalUrl)}
      </div>
    `),
  };
}

export function loserNotificationEmail(vars: { vendorName: string; bidTitle: string; portalUrl: string; senderName?: string; projectName?: string }) {
  return {
    subject: `Bid update: ${vars.bidTitle}`,
    html: emailWrapper(`
      <p style="margin: 0 0 16px; font-size: 15px; color: #333;">
        Hello <strong>${vars.vendorName}</strong>,
      </p>

      <p style="font-size: 14px; color: #555; line-height: 1.6;">
        Thank you for submitting your bid for <strong>${vars.bidTitle}</strong>${vars.projectName ? ` (${vars.projectName})` : ''}.
        We appreciate your time and effort. Unfortunately, another vendor has been selected for this bid.
      </p>

      <p style="font-size: 14px; color: #555;">We look forward to working with you on future projects.</p>

      <div style="text-align: center; margin: 24px 0;">
        ${goldButton('View Your Bids \u2192', vars.portalUrl)}
      </div>
    `),
  };
}

export function reminderEmail(vars: { vendorName: string; bidTitle: string; deadline: string; submitUrl: string; daysLeft: number; senderName?: string; projectName?: string }) {
  const urgency = vars.daysLeft <= 2 ? 'Last chance' : 'Reminder';
  const deadlineStr = new Date(vars.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const isUrgent = vars.daysLeft <= 2;

  return {
    subject: `${urgency}: ${vars.bidTitle} \u2014 ${vars.daysLeft} day${vars.daysLeft === 1 ? '' : 's'} left`,
    html: emailWrapper(`
      <p style="margin: 0 0 16px; font-size: 15px; color: #333;">
        Hello <strong>${vars.vendorName}</strong>,
      </p>

      <p style="font-size: 14px; color: #555;">
        ${vars.senderName ? `<strong>${vars.senderName}</strong> is waiting for your` : 'This is a friendly reminder about your'} bid submission for <strong>${vars.bidTitle}</strong>${vars.projectName ? ` (${vars.projectName})` : ''}.
      </p>

      <div style="background: ${isUrgent ? '#fef2f2' : '#fffbeb'}; border: 1.5px solid ${isUrgent ? '#fecaca' : '#fde68a'}; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
        <div style="font-size: 24px; font-weight: 800; color: ${isUrgent ? '#dc2626' : '#d97706'};">
          ${vars.daysLeft} day${vars.daysLeft === 1 ? '' : 's'} left
        </div>
        <div style="font-size: 13px; color: #666; margin-top: 4px;">
          Deadline: ${deadlineStr}
        </div>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        ${goldButton('Submit Your Bid Now \u2192', vars.submitUrl)}
      </div>

      <p style="font-size: 12px; color: #999; margin-top: 16px;">No account needed — click the button above.</p>
    `),
  };
}
