'use client';

import { useEffect, useState } from 'react';
import { useToast } from './layout';

interface Stats {
  totalUsers: number;
  activePaying: number;
  unpaidCount: number;
  mrr: number;
  unpaidUsers: any[];
  recentActivity: any[];
}

const activityColors: Record<string, string> = {
  payment: 'var(--green)', signup: 'var(--blue)', failed: 'var(--red)',
  suspend: 'var(--orange)', activate: 'var(--green)', login: 'var(--blue)',
  message: 'var(--gold)', admin: 'var(--muted)',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  if (!stats) return <p style={{ color: 'var(--muted)' }}>Loading...</p>;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)' }}>👥</div>
          <div><div className="stat-val">{stats.totalUsers}</div><div className="stat-lbl">Total Users</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-bg)' }}>✅</div>
          <div><div className="stat-val">{stats.activePaying}</div><div className="stat-lbl">Active Paying</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--red-bg)' }}>⚠️</div>
          <div><div className="stat-val">{stats.unpaidCount}</div><div className="stat-lbl">Unpaid</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--gold-bg)' }}>💰</div>
          <div><div className="stat-val">${stats.mrr.toLocaleString()}</div><div className="stat-lbl">MRR</div></div>
        </div>
      </div>

      <div className="grid-2">
        {/* Unpaid users */}
        <div className="table-card">
          <div className="table-head"><div className="table-title">⚠️ Unpaid — Needs Action</div></div>
          {stats.unpaidUsers.length === 0 && (
            <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: '0.85rem' }}>No unpaid users</div>
          )}
          {stats.unpaidUsers.map((u: any) => (
            <div key={u.id} className="unpaid-row">
              <div className="user-av" style={{ background: '#fee2e2', color: 'var(--red)' }}>{initials(u.name)}</div>
              <div><div className="user-name">{u.name}</div><div className="user-email">{u.email}</div></div>
              <span className="tag tag-unpaid">Unpaid</span>
              <button className="btn btn-xs btn-gold" onClick={() => {
                fetch(`/api/admin/messages`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    recipients: { type: 'custom', custom_ids: [u.id] },
                    subject: 'Payment Reminder — BidMaster',
                    body: `Hi ${u.name},\n\nThis is a reminder that your payment for BidMaster is overdue.\n\nPlease update your payment method.\n\nBidMaster Team`,
                  }),
                }).then(() => toast('Payment reminder sent to ' + u.name));
              }}>Remind</button>
            </div>
          ))}
        </div>

        {/* Recent activity */}
        <div className="table-card">
          <div className="table-head"><div className="table-title">📋 Recent Activity</div></div>
          {stats.recentActivity.length === 0 && (
            <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: '0.85rem' }}>No activity yet</div>
          )}
          {stats.recentActivity.map((a: any) => (
            <div key={a.id} className="feed-item">
              <div className="feed-dot" style={{ background: activityColors[a.type] || 'var(--muted)' }} />
              <div>
                <div className="feed-text">{a.text}</div>
                <div className="feed-time">{timeAgo(a.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
