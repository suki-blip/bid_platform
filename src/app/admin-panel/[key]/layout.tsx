'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import './admin.css';

// Toast context
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function useToast() { return useContext(ToastCtx); }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const key = params.key as string;
  const base = `/admin-panel/${key}`;
  const [authSet, setAuthSet] = useState(false);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!authSet) {
      fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }).then(() => setAuthSet(true)).catch(() => {});
    }
  }, [key, authSet]);

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(d => {
      setUnpaidCount(d.unpaidCount || 0);
    }).catch(() => {});
  }, [pathname]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const nav = [
    { section: 'Main' },
    { href: base, label: 'Dashboard', icon: '📊' },
    { href: `${base}/users`, label: 'Users', icon: '👥', badge: unpaidCount || undefined },
    { href: `${base}/payments`, label: 'Payments', icon: '💳' },
    { href: `${base}/messages`, label: 'Send Message', icon: '✉️' },
    { section: 'System' },
    { href: `${base}/activity`, label: 'Activity Log', icon: '📋' },
    { href: `${base}/settings`, label: 'Settings', icon: '⚙️' },
  ];

  function isActive(href: string) {
    if (href === base) return pathname === base || pathname === base + '/';
    return pathname.startsWith(href);
  }

  const titles: Record<string, [string, string]> = {
    [base]: ['Dashboard', 'Overview of all users and payments'],
    [`${base}/users`]: ['Users', 'Manage all user accounts'],
    [`${base}/payments`]: ['Payments', 'Payment history and status'],
    [`${base}/messages`]: ['Send Message', 'Send emails to your users'],
    [`${base}/activity`]: ['Activity Log', 'Full system activity log'],
    [`${base}/settings`]: ['Settings', 'Admin configuration'],
  };
  const [pageTitle, pageSub] = titles[pathname] || ['Admin', ''];

  return (
    <div className="admin-root">
      <div className="admin-sidebar">
        <div className="admin-logo">
          <div className="admin-logo-text">Bid<span>M</span>aster</div>
          <div className="admin-logo-sub">Admin Panel</div>
        </div>
        <nav>
          {nav.map((item, i) => {
            if ('section' in item && !('href' in item)) {
              return <div key={i} className="nav-section">{item.section}</div>;
            }
            const n = item as any;
            return (
              <Link key={n.href} href={n.href} className={`nav-item ${isActive(n.href) ? 'active' : ''}`}>
                <span className="ni">{n.icon}</span> {n.label}
                {n.badge ? <span className="nav-badge">{n.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin-pill">
            <div className="admin-av">SA</div>
            <div>
              <div className="admin-name">Super Admin</div>
              <div className="admin-role">admin@bidmaster.app</div>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-main">
        <div className="admin-topbar">
          <div>
            <div className="topbar-title">{pageTitle}</div>
            <div className="topbar-sub">{pageSub}</div>
          </div>
          <div className="topbar-right" id="topbar-actions" />
        </div>
        <div className="admin-content">
          <ToastCtx.Provider value={showToast}>
            {children}
          </ToastCtx.Provider>
        </div>
      </div>

      <div className={`admin-toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
