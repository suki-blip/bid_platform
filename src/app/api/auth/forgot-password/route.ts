import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { sendEmail, getAppUrl } from '@/lib/email';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    await dbReady();
    const client = db();
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const result = await client.execute({
      sql: 'SELECT id, name, email, password_hash FROM saas_users WHERE email = ?',
      args: [email.toLowerCase().trim()],
    });

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return NextResponse.json({ success: true });
    }

    const user = result.rows[0] as any;

    // Don't allow password reset for Google-only accounts
    if (user.password_hash?.startsWith('google:')) {
      // Still return success but send a different email
      await sendEmail({
        to: user.email,
        subject: 'Password Reset — BidMaster',
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background:#fff; border-radius:12px; overflow:hidden; border:1px solid #e5e5e0">
            <div style="background:#1a1a1a; padding:16px 24px;">
              <div style="color:#d97706; font-weight:800; font-size:18px">BidMaster</div>
            </div>
            <div style="padding:24px">
              <h2 style="color:#0f0f0f; font-size:18px; font-weight:800; margin:0 0 12px">Password Reset Request</h2>
              <p style="color:#666; font-size:14px; margin:0 0 16px">
                Hi ${user.name}, your account is linked to Google Sign-In. You don't have a password to reset.
              </p>
              <p style="color:#666; font-size:14px; margin:0 0 16px">
                Please use the <strong>"Continue with Google"</strong> button on the login page to sign in.
              </p>
            </div>
            <div style="background:#f9f9f6; padding:14px 24px; text-align:center; font-size:11px; color:#999">
              BidMaster — Smart Bid Management
            </div>
          </div>
        `,
      });
      return NextResponse.json({ success: true });
    }

    // Invalidate old tokens for this user
    await client.execute({
      sql: 'UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0',
      args: [user.id],
    });

    // Generate reset token (valid for 1 hour)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await client.execute({
      sql: 'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      args: [crypto.randomUUID(), user.id, token, expiresAt],
    });

    const appUrl = getAppUrl();
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: 'Password Reset — BidMaster',
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background:#fff; border-radius:12px; overflow:hidden; border:1px solid #e5e5e0">
          <div style="background:#1a1a1a; padding:16px 24px;">
            <div style="color:#d97706; font-weight:800; font-size:18px">BidMaster</div>
          </div>
          <div style="padding:24px">
            <h2 style="color:#0f0f0f; font-size:18px; font-weight:800; margin:0 0 12px">Reset Your Password</h2>
            <p style="color:#666; font-size:14px; margin:0 0 16px">
              Hi ${user.name}, we received a request to reset your password.
              Click the button below to set a new password.
            </p>
            <div style="text-align:center; margin:24px 0">
              <a href="${resetUrl}" style="display:inline-block; background:#d97706; color:#fff; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:700; font-size:15px">
                Reset Password →
              </a>
            </div>
            <p style="color:#999; font-size:12px; margin:0 0 8px">
              This link expires in 1 hour.
            </p>
            <p style="color:#999; font-size:12px; margin:0">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
          <div style="background:#f9f9f6; padding:14px 24px; text-align:center; font-size:11px; color:#999">
            BidMaster — Smart Bid Management
          </div>
        </div>
      `,
    });

    await client.execute({
      sql: 'INSERT INTO activity_log (id, type, text) VALUES (?, ?, ?)',
      args: [crypto.randomUUID(), 'password_reset', `Password reset requested for ${user.email}`],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
