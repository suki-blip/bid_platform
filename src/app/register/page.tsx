'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, company, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      router.push('/customer');
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '12px 16px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: '#fff', fontSize: '0.95rem',
    outline: 'none', boxSizing: 'border-box' as const,
  };
  const labelStyle = { display: 'block' as const, fontSize: '0.85rem', color: '#8a8fa8', marginBottom: 8, fontWeight: 500 as const };

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
          <p style={{ color: '#8a8fa8', fontSize: '0.95rem' }}>Create your contractor account</p>
          <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 4 }}>14-day free trial — no credit card required</p>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: '#1c1f2e',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: '36px 32px',
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="James Robertson" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Robertson LLC" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div>
              <label style={labelStyle}>Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min 8 characters" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Confirm Password *</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Repeat password" style={inputStyle} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              background: '#f5a623', color: '#0a0a0f',
              border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: '1rem',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'Creating Account...' : 'Start Free Trial'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.85rem', color: '#8a8fa8' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#f5a623', textDecoration: 'none' }}>Sign In</Link>
        </p>
      </div>
    </div>
  );
}
