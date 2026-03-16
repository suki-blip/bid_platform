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

// --- Email Templates ---

export function bidInvitationEmail(vars: { vendorName: string; bidTitle: string; bidDescription: string; deadline: string; submitUrl: string }) {
  return {
    subject: `You're invited to bid: ${vars.bidTitle}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; color: #fff; padding: 20px 24px;">
          <h1 style="margin: 0; font-size: 18px;">BidMaster</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e5e0; border-top: none;">
          <p>Hello <strong>${vars.vendorName}</strong>,</p>
          <p>You have been invited to submit a bid for:</p>
          <div style="background: #f9f9f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <h2 style="margin: 0 0 8px; font-size: 16px;">${vars.bidTitle}</h2>
            <p style="margin: 0 0 8px; color: #666; font-size: 14px;">${vars.bidDescription}</p>
            <p style="margin: 0; font-size: 13px; color: #999;">Deadline: <strong>${new Date(vars.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></p>
          </div>
          <a href="${vars.submitUrl}" style="display: inline-block; background: #b8860b; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px;">Submit Your Bid</a>
          <p style="margin-top: 20px; font-size: 13px; color: #999;">No account needed — just click the link above to submit your pricing.</p>
        </div>
      </div>
    `,
  };
}

export function winnerNotificationEmail(vars: { vendorName: string; bidTitle: string; notes?: string }) {
  return {
    subject: `Congratulations! You won: ${vars.bidTitle}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; color: #fff; padding: 20px 24px;">
          <h1 style="margin: 0; font-size: 18px;">BidMaster</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e5e0; border-top: none;">
          <h2 style="color: #16a34a;">Congratulations, ${vars.vendorName}!</h2>
          <p>Your bid has been selected as the winner for <strong>${vars.bidTitle}</strong>.</p>
          ${vars.notes ? `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin: 16px 0;"><p style="margin: 0; font-size: 14px;">${vars.notes}</p></div>` : ''}
          <p>The contractor will be in touch with next steps.</p>
          <p style="font-size: 13px; color: #999; margin-top: 20px;">Thank you for using BidMaster.</p>
        </div>
      </div>
    `,
  };
}

export function loserNotificationEmail(vars: { vendorName: string; bidTitle: string }) {
  return {
    subject: `Bid update: ${vars.bidTitle}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; color: #fff; padding: 20px 24px;">
          <h1 style="margin: 0; font-size: 18px;">BidMaster</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e5e0; border-top: none;">
          <p>Hello ${vars.vendorName},</p>
          <p>Thank you for submitting your bid for <strong>${vars.bidTitle}</strong>.</p>
          <p>We appreciate your time and effort. Unfortunately, another vendor has been selected for this bid.</p>
          <p>We hope to work with you on future projects.</p>
          <p style="font-size: 13px; color: #999; margin-top: 20px;">Thank you for using BidMaster.</p>
        </div>
      </div>
    `,
  };
}

export function reminderEmail(vars: { vendorName: string; bidTitle: string; deadline: string; submitUrl: string; daysLeft: number }) {
  const urgency = vars.daysLeft <= 2 ? 'Last chance' : 'Reminder';
  return {
    subject: `${urgency}: ${vars.bidTitle} — ${vars.daysLeft} day${vars.daysLeft === 1 ? '' : 's'} left`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; color: #fff; padding: 20px 24px;">
          <h1 style="margin: 0; font-size: 18px;">BidMaster</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e5e0; border-top: none;">
          <p>Hello ${vars.vendorName},</p>
          <p>This is a friendly reminder that the deadline for <strong>${vars.bidTitle}</strong> is approaching.</p>
          <div style="background: ${vars.daysLeft <= 2 ? '#fef2f2' : '#fffbeb'}; border: 1px solid ${vars.daysLeft <= 2 ? '#fecaca' : '#fde68a'}; border-radius: 8px; padding: 12px; margin: 16px 0;">
            <p style="margin: 0; font-weight: 700; color: ${vars.daysLeft <= 2 ? '#c00' : '#92400e'};">
              ${vars.daysLeft} day${vars.daysLeft === 1 ? '' : 's'} remaining — Deadline: ${new Date(vars.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <a href="${vars.submitUrl}" style="display: inline-block; background: #b8860b; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px;">Submit Your Bid Now</a>
          <p style="font-size: 13px; color: #999; margin-top: 20px;">No account needed — just click the link above.</p>
        </div>
      </div>
    `,
  };
}
