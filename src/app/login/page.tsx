'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      router.push('/customer');
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="login-split">
      {/* Brand Panel */}
      <div className="login-brand-panel">
        <div className="login-brand-inner">
          <Link href="/" className="login-logo-link">
            <div className="login-logo-icon">M</div>
            <span className="login-logo-text">Bid<span>Master</span></span>
          </Link>

          <h2 className="login-headline">Win More Bids.<br/>Build Smarter.</h2>
          <p className="login-subtitle">
            The all-in-one platform for construction contractors to manage bids, track projects, and grow their business.
          </p>

          <div className="login-features">
            <div className="login-feat">
              <div className="login-feat-icon">📊</div>
              <div>
                <div className="login-feat-title">Real-time Analytics</div>
                <div className="login-feat-desc">Track bid status and win rates instantly</div>
              </div>
            </div>
            <div className="login-feat">
              <div className="login-feat-icon">👷</div>
              <div>
                <div className="login-feat-title">Vendor Management</div>
                <div className="login-feat-desc">Manage subcontractors and suppliers</div>
              </div>
            </div>
            <div className="login-feat">
              <div className="login-feat-icon">📁</div>
              <div>
                <div className="login-feat-title">Document Hub</div>
                <div className="login-feat-desc">Centralized file &amp; document management</div>
              </div>
            </div>
            <div className="login-feat">
              <div className="login-feat-icon">💰</div>
              <div>
                <div className="login-feat-title">Payment Tracking</div>
                <div className="login-feat-desc">Automated invoicing &amp; payment flow</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Panel */}
      <div className="login-form-panel">
        <div className="login-form-inner">
          <div className="login-form-head">
            <h1>Welcome back</h1>
            <p>Sign in to continue to your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-error">{error}</div>
            )}

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

            <div className="login-field">
              <label>Password</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="login-submit">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="login-divider"><span>or</span></div>

          <button className="login-google" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <p className="login-toggle">
            Don&apos;t have an account?{' '}
            <Link href="/register">Start Free Trial</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
