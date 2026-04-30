'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { Suspense } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
        };
      };
    };
  }
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'vendor' ? 'vendor' : 'contractor';

  const resetToken = searchParams.get('reset');

  // Brand the login page based on which domain the user arrived from.
  // easyfundraisings.com → YeshivaRaise; everywhere else → BidMaster.
  const [isFundraisingBrand, setIsFundraisingBrand] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hostname.includes('easyfundraisings')) {
      setIsFundraisingBrand(true);
    }
  }, []);

  const postLoginRedirect = isFundraisingBrand ? '/fundraising' : '/customer';

  const [activeTab, setActiveTab] = useState<'contractor' | 'vendor'>(initialTab as any);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Vendor forgot/reset password states
  const [vendorView, setVendorView] = useState<'login' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [resetPw, setResetPw] = useState('');
  const [resetPw2, setResetPw2] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleGoogleResponse = useCallback(async (response: any) => {
    setError('');
    setGoogleLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Google login failed'); setGoogleLoading(false); return; }
      router.push(postLoginRedirect);
    } catch { setError('Network error.'); setGoogleLoading(false); }
  }, [router, postLoginRedirect]);

  useEffect(() => {
    fetch('/api/auth/google-client-id').then(r => r.json()).then(d => { if (d.clientId) setGoogleClientId(d.clientId); }).catch(() => {});
  }, []);

  function initGoogleBtn() {
    if (!googleClientId || !window.google) return;
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleResponse });
    const btnEl = document.getElementById('google-signin-btn');
    if (btnEl) {
      btnEl.innerHTML = '';
      window.google.accounts.id.renderButton(btnEl, { theme: 'outline', size: 'large', width: '100%', text: 'continue_with', shape: 'rectangular' });
    }
  }

  useEffect(() => { if (googleClientId && window.google) initGoogleBtn(); }, [googleClientId, handleGoogleResponse, activeTab]);

  // Reset form when switching tabs
  useEffect(() => { setEmail(''); setPassword(''); setError(''); if (activeTab === 'contractor') setVendorView('login'); }, [activeTab]);

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/vendor-auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to send reset email');
        setLoading(false);
        return;
      }
      setForgotSent(true);
      setLoading(false);
    } catch {
      setError('Network error.');
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (resetPw !== resetPw2) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/vendor-auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: resetPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        setLoading(false);
        return;
      }
      setResetSuccess(true);
      setLoading(false);
      setTimeout(() => router.push('/vendor'), 1500);
    } catch {
      setError('Network error.');
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (activeTab === 'vendor') {
      try {
        const res = await fetch('/api/vendor-auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return; }
        router.push('/vendor');
      } catch { setError('Network error.'); setLoading(false); }
    } else {
      // Try contractor login first, then team member login
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (res.ok) {
          router.push(postLoginRedirect);
          return;
        }
        // If contractor login fails, try team member login
        const teamRes = await fetch('/api/team-auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const teamData = await teamRes.json();
        if (teamRes.ok) {
          router.push(postLoginRedirect);
          return;
        }
        setError(teamData.error || 'Invalid email or password');
        setLoading(false);
      } catch { setError('Network error.'); setLoading(false); }
    }
  }

  return (
    <div className="login-split">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initGoogleBtn} />

      {/* Brand Panel — host-aware */}
      <div className="login-brand-panel">
        <div className="login-brand-inner">
          {isFundraisingBrand ? (
            <>
              <Link href="/" className="login-logo-link">
                <div className="login-logo-icon" style={{ background: '#0a1019', color: '#f7f3e9', fontFamily: 'var(--font-bricolage), sans-serif', display: 'grid', placeItems: 'center' }}>₪</div>
                <span className="login-logo-text" style={{ color: '#0a1019' }}>YeshivaRaise</span>
              </Link>

              <div className="login-eyebrow">FOR FUNDRAISING TEAMS</div>
              <h2 className="login-headline">
                Track every donor.<br />Close every <em>pledge.</em>
              </h2>
              <p className="login-subtitle">
                A full ledger for the way fundraising actually runs — donors, pledges, calls, follow-ups, and tax receipts. With Hebrew &amp; Gregorian dates, side-by-side.
              </p>

              <div className="login-features">
                <div className="login-feat">
                  <div className="login-feat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div>
                    <div className="login-feat-title">Donor profile in one place</div>
                    <div className="login-feat-desc">Phones, addresses, Hebrew name, source, calls, notes, pledges, payments — all on one page.</div>
                  </div>
                </div>
                <div className="login-feat">
                  <div className="login-feat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6"/><path d="M12 22v-6"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="M2 12h6"/><path d="M22 12h-6"/></svg>
                  </div>
                  <div>
                    <div className="login-feat-title">Auto-installment pledges</div>
                    <div className="login-feat-desc">Lump sum, monthly, quarterly — the schedule generates itself. Check, credit card, wire, ACH all tracked.</div>
                  </div>
                </div>
                <div className="login-feat">
                  <div className="login-feat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
                  </div>
                  <div>
                    <div className="login-feat-title">Hebrew + Gregorian calendar</div>
                    <div className="login-feat-desc">Every follow-up, payment, and yahrzeit dated in both. Holidays auto-marked. Built for our way of working.</div>
                  </div>
                </div>
                <div className="login-feat">
                  <div className="login-feat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>
                  </div>
                  <div>
                    <div className="login-feat-title">Reports that close the books</div>
                    <div className="login-feat-desc">By project, source, donor, fundraiser. CSV export with UTF-8 Hebrew. The annual statement every donor expects.</div>
                  </div>
                </div>
              </div>

              <div className="login-stamps-row">
                <span className="stamp ok">PAID</span>
                <span className="stamp notes">PLEDGED</span>
                <span className="stamp revise">OVERDUE</span>
                <span className="stamp draft">PROSPECT</span>
              </div>
              <div className="login-credit">YESHIVARAISE · EASYFUNDRAISINGS.COM · 5786</div>
            </>
          ) : (
            <>
              <Link href="/" className="login-logo-link">
                <div className="login-logo-icon">M</div>
                <span className="login-logo-text">Bid<span>Master</span></span>
              </Link>

              <div className="login-eyebrow">FOR NYC GENERAL CONTRACTORS</div>
              <h2 className="login-headline">
                Stop chasing subs.<br />Start <em>closing bids.</em>
              </h2>
              <p className="login-subtitle">
                Built for the way NYC construction actually runs — COIs, AIA submittals, G703 pay apps, and 30+ subs you&apos;re trying to keep on schedule.
              </p>

              <div className="login-features">
                <div className="login-feat">
                  <div className="login-feat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  </div>
                  <div>
                    <div className="login-feat-title">Track every COI in one inbox</div>
                    <div className="login-feat-desc">No sub on site without a current Certificate of Insurance — chased automatically before it expires.</div>
                  </div>
                </div>
                <div className="login-feat">
                  <div className="login-feat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>
                  </div>
                  <div>
                    <div className="login-feat-title">Apples-to-apples bid comparison</div>
                    <div className="login-feat-desc">G703-style ledger lines up every sub&apos;s scope side-by-side. Missing items flagged in cone orange.</div>
                  </div>
                </div>
                <div className="login-feat">
                  <div className="login-feat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/></svg>
                  </div>
                  <div>
                    <div className="login-feat-title">See who&apos;s late — today</div>
                    <div className="login-feat-desc">Chase List sorts overdue quotes, RFIs, and signed change orders by days slipped. One tap to send reminders.</div>
                  </div>
                </div>
                <div className="login-feat">
                  <div className="login-feat-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6"/><path d="M9 13h6"/><path d="M9 18h4"/></svg>
                  </div>
                  <div>
                    <div className="login-feat-title">AIA submittal stamps</div>
                    <div className="login-feat-desc">Approved · Approved as Noted · Revise &amp; Resubmit · Rejected — the four categories your team already uses.</div>
                  </div>
                </div>
              </div>

              <div className="login-stamps-row">
                <span className="stamp ok">APPROVED</span>
                <span className="stamp notes">AS NOTED</span>
                <span className="stamp revise">REVISE</span>
                <span className="stamp draft">PENDING</span>
              </div>
              <div className="login-credit">DOC. BIDMASTER · NYC · REV. 2026</div>
            </>
          )}
        </div>
      </div>

      {/* Form Panel */}
      <div className="login-form-panel">
        <div className="login-form-inner">
          {/* Tab Selector — hidden on the fundraising domain (vendors aren't relevant there) */}
          {!isFundraisingBrand && (
            <div className="login-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'contractor'}
                onClick={() => setActiveTab('contractor')}
                className={`login-tab${activeTab === 'contractor' ? ' on' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M10 21v-6h4v6"/></svg>
                General Contractor
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'vendor'}
                onClick={() => setActiveTab('vendor')}
                className={`login-tab vendor${activeTab === 'vendor' ? ' on' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 7h20l-2 13H4L2 7z"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></svg>
                Subcontractor
              </button>
            </div>
          )}

          <div className="login-form-head">
            <h1>{isFundraisingBrand
              ? 'Sign in'
              : activeTab === 'vendor'
                ? vendorView === 'forgot' ? 'Forgot password'
                : vendorView === 'reset' ? 'Reset password'
                : 'Sign in — Subcontractor'
                : 'Sign in — Contractor'}</h1>
            <p>{isFundraisingBrand
              ? 'Open today\'s desk and run your fundraising'
              : activeTab === 'vendor'
                ? vendorView === 'forgot' ? 'We\'ll email you a reset link'
                : vendorView === 'reset' ? 'Choose a new password for your account'
                : 'Submit bids and track awarded jobs'
                : 'Open the chase list and run today\'s job'}</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form" style={activeTab === 'vendor' && vendorView !== 'login' ? { display: 'none' } : {}}>
            {error && <div className="login-error">{error}</div>}

            <div className="login-field">
              <label>Email</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" />
              </div>
            </div>

            <div className="login-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Password</label>
                {activeTab === 'contractor' && (
                  <Link href="/forgot-password" style={{ fontSize: '0.8rem', color: 'var(--blueprint)', textDecoration: 'none', fontWeight: 600 }}>
                    Forgot password?
                  </Link>
                )}
                {activeTab === 'vendor' && (
                  <button type="button" onClick={() => { setVendorView('forgot'); setError(''); }} style={{ fontSize: '0.8rem', color: 'var(--blueprint)', textDecoration: 'none', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="login-input-wrap">
                <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Enter your password" />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    color: '#999', display: 'flex', alignItems: 'center',
                  }}
                  title={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="login-submit"
              style={activeTab === 'vendor' ? { background: 'var(--blueprint)', color: 'var(--paper-3)' } : {}}
            >
              {loading ? 'Signing in…' : (activeTab === 'vendor' ? 'Sign in to portal' : 'Open chase list')}
            </button>
          </form>

          {/* Google OAuth — only for contractors (and not during vendor forgot/reset) */}
          {activeTab === 'contractor' && (
            <>
              <div className="login-divider"><span>or</span></div>
              {googleClientId ? (
                <div style={{ position: 'relative', minHeight: 44 }}>
                  {googleLoading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)', borderRadius: 8, zIndex: 2, fontSize: '0.9rem', color: '#666' }}>
                      Signing in with Google...
                    </div>
                  )}
                  <div id="google-signin-btn" style={{ display: 'flex', justifyContent: 'center' }} />
                </div>
              ) : (
                <button className="login-google" type="button" disabled style={{ opacity: 0.5 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Continue with Google
                </button>
              )}
            </>
          )}

          {/* Vendor info */}
          {activeTab === 'vendor' && vendorView === 'login' && (
            <div className="login-vendor-info">
              <strong>Got an invitation link?</strong> Use it to submit your bid directly — no login needed.
            </div>
          )}

          {/* Vendor forgot password form */}
          {activeTab === 'vendor' && vendorView === 'forgot' && (
            <div style={{ marginTop: -8 }}>
              {forgotSent ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>✉️</div>
                  <p style={{ fontWeight: 600, marginBottom: 8 }}>Check your email</p>
                  <p style={{ color: '#666', fontSize: '0.88rem' }}>If an account exists with that email, we sent a password reset link.</p>
                  <button type="button" onClick={() => { setVendorView('login'); setForgotSent(false); setForgotEmail(''); }} style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--blueprint)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="login-form">
                  {error && <div className="login-error">{error}</div>}
                  <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: 16 }}>Enter your email and we'll send you a link to reset your password.</p>
                  <div className="login-field">
                    <label>Email</label>
                    <div className="login-input-wrap">
                      <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required placeholder="you@company.com" />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="login-submit" style={{ background: 'var(--blueprint)', color: 'var(--paper-3)' }}>
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                  <button type="button" onClick={() => { setVendorView('login'); setError(''); }} style={{ display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'var(--blueprint)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                    Back to Sign In
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Vendor reset password form */}
          {activeTab === 'vendor' && vendorView === 'reset' && (
            <div style={{ marginTop: -8 }}>
              {resetSuccess ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>✅</div>
                  <p style={{ fontWeight: 600, marginBottom: 8 }}>Password reset successfully!</p>
                  <p style={{ color: '#666', fontSize: '0.88rem' }}>Redirecting to your portal...</p>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="login-form">
                  {error && <div className="login-error">{error}</div>}
                  <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: 16 }}>Enter your new password below.</p>
                  <div className="login-field">
                    <label>New Password</label>
                    <div className="login-input-wrap">
                      <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} required placeholder="Min 8 characters" />
                    </div>
                  </div>
                  <div className="login-field">
                    <label>Confirm Password</label>
                    <div className="login-input-wrap">
                      <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <input type="password" value={resetPw2} onChange={e => setResetPw2(e.target.value)} required placeholder="Repeat password" />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="login-submit" style={{ background: 'var(--blueprint)', color: 'var(--paper-3)' }}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                  <button type="button" onClick={() => { setVendorView('login'); setError(''); }} style={{ display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'var(--blueprint)', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                    Back to Sign In
                  </button>
                </form>
              )}
            </div>
          )}

          <p className="login-toggle">
            {activeTab === 'contractor' ? (
              <>Don&apos;t have an account?{' '}<Link href="/register">Create Account</Link></>
            ) : (
              <>Are you a contractor?{' '}<button type="button" onClick={() => setActiveTab('contractor')} style={{ background: 'none', border: 'none', color: 'var(--blueprint)', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit', padding: 0 }}>Sign in here</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
