'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function VendorLoginPage() {
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
      const res = await fetch('/api/vendor-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid email or password');
        setLoading(false);
        return;
      }

      router.push('/vendor');
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#fff',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.85rem',
    color: '#8a8fa8',
    marginBottom: 8,
    fontWeight: 500,
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
      color: '#fff',
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '1.8rem',
              letterSpacing: '-0.02em',
              color: '#fff',
              marginBottom: 8,
            }}>
              Bid<span style={{ color: '#f5a623' }}>Master</span>
            </div>
          </Link>
          <div style={{
            display: 'inline-block',
            background: 'rgba(245,166,35,0.15)',
            color: '#f5a623',
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            marginBottom: 12,
          }}>VENDOR PORTAL</div>
          <p style={{ color: '#8a8fa8', fontSize: '0.95rem' }}>Sign in to your vendor account</p>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: '#1c1f2e',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: '40px 36px',
        }}>
          {error && (
            <div style={{
              background: 'rgba(255,59,48,0.12)',
              border: '1px solid rgba(255,59,48,0.3)',
              color: '#ff6b6b',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.85rem',
              marginBottom: 20,
            }}>{error}</div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
              <span style={{ fontSize: '0.8rem', color: '#666' }}>Contact admin to reset</span>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: '#f5a623',
              color: '#0a0a0f',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: '1rem',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{
          textAlign: 'center',
          marginTop: 24,
          fontSize: '0.85rem',
          color: '#8a8fa8',
        }}>
          Have an invitation link?{' '}
          <span style={{ color: '#f5a623' }}>Use it to submit your bid directly</span>
        </p>
      </div>
    </div>
  );
}
