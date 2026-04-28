'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-split" style={{ background: '#f5f5f3' }}>
      <div className="login-brand-panel">
        <div className="login-brand-inner">
          <Link href="/" className="login-logo-link">
            <div className="login-logo-icon">M</div>
            <span className="login-logo-text">Bid<span>Master</span></span>
          </Link>
          <h2 className="login-headline">Forgot your<br/>password?</h2>
          <p className="login-subtitle">
            No worries — we&apos;ll send you a reset link to your email address.
          </p>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-form-inner">
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✉️</div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f0f0f', margin: '0 0 8px' }}>Check your email</h1>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: 24 }}>
                We sent a password reset link to <strong>{email}</strong>.<br/>
                The link expires in 1 hour.
              </p>
              <p style={{ color: '#999', fontSize: '0.85rem', marginBottom: 24 }}>
                Didn&apos;t receive it? Check your spam folder or try again.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                style={{ background: 'none', border: '1px solid #e5e5e0', padding: '10px 24px', borderRadius: 8, color: '#0f0f0f', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
              >
                Try another email
              </button>
              <p className="login-toggle" style={{ marginTop: 20 }}>
                <Link href="/login">← Back to Sign In</Link>
              </p>
            </div>
          ) : (
            <>
              <div className="login-form-head">
                <h1>Reset Password</h1>
                <p>Enter your email and we&apos;ll send you a reset link</p>
              </div>

              <form onSubmit={handleSubmit} className="login-form">
                {error && <div className="login-error">{error}</div>}

                <div className="login-field">
                  <label>Email</label>
                  <div className="login-input-wrap">
                    <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="login-submit">
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <p className="login-toggle">
                Remember your password?{' '}
                <Link href="/login">Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
