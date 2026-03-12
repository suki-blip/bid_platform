'use client';

import { useEffect, useState } from 'react';

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

export default function ActivityPage() {
  const [activity, setActivity] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetch(`/api/admin/activity?limit=${limit}`).then(r => r.json()).then(d => {
      setActivity(d.activity || []);
      setTotal(d.total || 0);
    });
  }, [limit]);

  return (
    <div className="table-card">
      <div className="table-head"><div className="table-title">Activity Log ({total})</div></div>
      {activity.map(a => (
        <div key={a.id} className="feed-item">
          <div className="feed-dot" style={{ background: activityColors[a.type] || 'var(--muted)' }} />
          <div>
            <div className="feed-text">{a.text}</div>
            <div className="feed-time">{timeAgo(a.created_at)}</div>
          </div>
        </div>
      ))}
      {activity.length === 0 && <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: '0.85rem' }}>No activity yet</div>}
      {activity.length < total && (
        <div style={{ padding: '14px 18px', textAlign: 'center' }}>
          <button className="btn btn-outline" onClick={() => setLimit(l => l + 50)}>Load More</button>
        </div>
      )}
    </div>
  );
}
