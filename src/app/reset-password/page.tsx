'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-form-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="login-form-inner" style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f0f0f', margin: '0 0 12px' }}>Invalid Link</h1>
          <p style={{ color: '#666', marginBottom: 24 }}>This password reset link is invalid or has been used.</p>
          <Link href="/forgot-password" style={{ color: '#d97706', fontWeight: 600 }}>Request a new reset link →</Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-form-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="login-form-inner" style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f0f0f', margin: '0 0 12px' }}>Password Reset!</h1>
          <p style={{ color: '#666', marginBottom: 24 }}>Your password has been updated successfully.</p>
          <Link href="/login" className="login-submit" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none', padding: '14px 32px' }}>
            Sign In →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-form-panel">
      <div className="login-form-inner">
        <div className="login-form-head">
          <h1>Set New Password</h1>
          <p>Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="login-field">
            <label>New Password</label>
            <div className="login-input-wrap">
              <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Min 8 characters"
              />
            </div>
          </div>

          <div className="login-field">
            <label>Confirm Password</label>
            <div className="login-input-wrap">
              <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repeat password"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <p className="login-toggle">
          <Link href="/login">← Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="login-split" style={{ background: '#f5f5f3' }}>
      <div className="login-brand-panel">
        <div className="login-brand-inner">
          <Link href="/" className="login-logo-link">
            <div className="login-logo-icon">M</div>
            <span className="login-logo-text">Bid<span>Master</span></span>
          </Link>
          <h2 className="login-headline">Set your new<br/>password</h2>
          <p className="login-subtitle">
            Choose a strong password to keep your account secure.
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="login-form-panel"><div className="login-form-inner"><p>Loading...</p></div></div>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
