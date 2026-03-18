'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLoginPage() {
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
      const res = await fetch('/api/admin/login', {
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

      // Redirect to admin panel
      if (data.redirect) {
        router.push(data.redirect);
      }
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      color: '#fff',
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 900,
              fontSize: '1.8rem',
              letterSpacing: '-0.03em',
              color: '#fff',
              marginBottom: 6,
            }}>
              Bid<span style={{ color: '#d97706' }}>M</span>aster
            </div>
          </Link>
          <p style={{ color: '#6b7280', fontSize: '0.88rem', fontWeight: 600 }}>Admin Panel</p>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: '#1a1a1f',
          border: '1.5px solid #2a2a35',
          borderRadius: 16,
          padding: '36px 32px',
        }}>
          {error && (
            <div style={{
              background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.3)',
              color: '#fca5a5',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 600,
              marginBottom: 20,
            }}>{error}</div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block', fontSize: '0.78rem', color: '#9ca3af',
              marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>Admin Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="admin@bidmaster.app"
              style={{
                width: '100%', padding: '11px 14px',
                background: '#0f0f0f',
                border: '1.5px solid #2a2a35',
                borderRadius: 8, color: '#fff', fontSize: '0.9rem',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#d97706'}
              onBlur={e => e.target.style.borderColor = '#2a2a35'}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: 'block', fontSize: '0.78rem', color: '#9ca3af',
              marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Enter admin password"
              style={{
                width: '100%', padding: '11px 14px',
                background: '#0f0f0f',
                border: '1.5px solid #2a2a35',
                borderRadius: 8, color: '#fff', fontSize: '0.9rem',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = '#d97706'}
              onBlur={e => e.target.style.borderColor = '#2a2a35'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: '#d97706', color: '#000',
              border: 'none', borderRadius: 8,
              fontWeight: 800, fontSize: '0.9rem',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s',
              fontFamily: 'inherit',
              letterSpacing: '-0.01em',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In to Admin'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.8rem', color: '#4b5563' }}>
          <Link href="/portal" style={{ color: '#6b7280', textDecoration: 'none' }}>← Back to Portal</Link>
        </p>
      </div>
    </div>
  );
}
