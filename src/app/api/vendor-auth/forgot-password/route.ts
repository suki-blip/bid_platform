import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { sendEmail, getAppUrl } from '@/lib/email';

export async function POST(request: Request) {
  try {
    await dbReady();
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find vendor by email
    const vendorResult = await db().execute({
      sql: 'SELECT id, name, email FROM vendors WHERE email = ?',
      args: [email.toLowerCase().trim()],
    });

    // Always return success to prevent email enumeration
    if (vendorResult.rows.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const vendor = vendorResult.rows[0] as Record<string, unknown>;
    const token = crypto.randomUUID();

    // Store reset token (reuse bid_invitations token mechanism or create a simple reset table)
    // For simplicity, we'll store a reset token on the vendor directly
    await db().execute({
      sql: `UPDATE vendors SET reset_token = ?, reset_token_expires = datetime('now', '+1 hour') WHERE id = ?`,
      args: [token, String(vendor.id)],
    });

    const appUrl = getAppUrl();
    const resetUrl = `${appUrl}/vendor-login?reset=${token}`;

    await sendEmail({
      to: String(vendor.email),
      subject: 'Reset Your BidMaster Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #f5a623;">BidMaster Password Reset</h2>
          <p>Hi ${vendor.name || 'there'},</p>
          <p>You requested to reset your password. Click the button below:</p>
          <a href="${resetUrl}" style="display: inline-block; background: #f5a623; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 700; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 0.85rem;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
