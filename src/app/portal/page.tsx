"use client";

import Link from "next/link";

export default function PortalPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="mb-2" style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.03em' }}>
        Bid<span style={{ color: 'var(--gold)' }}>Master</span>
      </div>
      <p className="mb-12 text-lg" style={{ color: 'var(--muted)' }}>Choose your portal to get started</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-2xl">
        <Link
          href="/login"
          className="flex flex-col items-center justify-center rounded-xl p-10 transition-all hover:-translate-y-0.5 group"
          style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '12px' }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--gold-b)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.07)'; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-4 text-2xl" style={{ background: 'var(--gold-bg)', border: '1px solid var(--gold-b)' }}>
            👷
          </div>
          <span className="text-xl font-bold" style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: 'var(--ink)' }}>Contractor</span>
          <span className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Create and manage bid requests</span>
        </Link>

        <Link
          href="/login?tab=vendor"
          className="flex flex-col items-center justify-center rounded-xl p-10 transition-all hover:-translate-y-0.5 group"
          style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '12px' }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--gold-b)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.07)'; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-4 text-2xl" style={{ background: 'var(--blue-bg)', border: '1px solid var(--blue-b)' }}>
            🏢
          </div>
          <span className="text-xl font-bold" style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: 'var(--ink)' }}>Vendor</span>
          <span className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Browse bids and submit prices</span>
        </Link>
      </div>

      <div className="mt-8">
        <Link
          href="/admin-login"
          className="text-sm"
          style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '0.8rem' }}
        >
          Admin Panel →
        </Link>
      </div>
    </main>
  );
}
