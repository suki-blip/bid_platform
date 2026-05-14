import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { sendFundraisingEmail } from '@/lib/fundraising-email';

// POST /api/fundraising/settings/email/test
//
// Sends a tiny self-test email to a user-supplied address using the owner's currently
// saved Resend config. Lets the manager verify their setup before relying on it for
// real receipts.
//
// Body: { to: string }

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await dbReady();

  const body = (await request.json().catch(() => ({}))) as { to?: string };
  const to = (body.to || '').trim();
  if (!to || !to.includes('@')) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }

  const result = await sendFundraisingEmail({
    ownerId: session.ownerId,
    to,
    subject: 'easyfundraisings test email',
    html: `
<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a;line-height:1.5;">
  <h1 style="font-size:22px;margin:0 0 10px;">It works! 🎉</h1>
  <p style="font-size:14px;margin:0;">
    This is a test from your easyfundraisings setup. If you can read this in your inbox,
    your Resend configuration is good to go — receipts and bulk emails will go out using
    these settings.
  </p>
</div>`,
    template: 'test',
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || 'Send failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message_id: result.resend_message_id });
}
