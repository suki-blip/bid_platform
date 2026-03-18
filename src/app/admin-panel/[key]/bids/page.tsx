'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../layout';

interface BidRequest {
  id: number;
  project_name: string;
  category: string;
  vendor_name: string;
  amount: number;
  status: string;
  sent_at: string;
  responded_at: string | null;
}

export default function BidsPage() {
  const toast = useToast();
  const [bids, setBids] = useState<BidRequest[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data
    const mockBids: BidRequest[] = [
      { id: 1, project_name: 'Downtown Office Complex', category: 'Kitchen Cabinets', vendor_name: 'Superior Kitchen Designs', amount: 52000, status: 'responded', sent_at: '2025-02-08 09:15', responded_at: '2025-02-09 05:15' },
      { id: 2, project_name: 'Downtown Office Complex', category: 'Electrical', vendor_name: 'PowerLine Electric', amount: 185000, status: 'approved', sent_at: '2025-02-07 10:00', responded_at: '2025-02-08 14:30' },
      { id: 3, project_name: 'Highway Bridge Construction', category: 'Concrete', vendor_name: 'Rodriguez Contractors', amount: 420000, status: 'responded', sent_at: '2025-02-06 08:00', responded_at: '2025-02-07 11:45' },
      { id: 4, project_name: 'Residential Tower Phase 2', category: 'Plumbing', vendor_name: 'AquaFlow Plumbing', amount: 95000, status: 'pending', sent_at: '2025-02-10 14:00', responded_at: null },
      { id: 5, project_name: 'School Renovation', category: 'Flooring', vendor_name: 'FloorPro Inc', amount: 67000, status: 'declined', sent_at: '2025-02-05 09:30', responded_at: '2025-02-06 16:00' },
      { id: 6, project_name: 'Hospital Wing Extension', category: 'HVAC', vendor_name: 'CoolAir Systems', amount: 310000, status: 'counter', sent_at: '2025-02-09 07:00', responded_at: '2025-02-10 09:20' },
      { id: 7, project_name: 'Shopping Mall Remodel', category: 'Painting', vendor_name: 'ProPaint Solutions', amount: 45000, status: 'approved', sent_at: '2025-02-04 11:00', responded_at: '2025-02-05 15:30' },
      { id: 8, project_name: 'Water Treatment Plant', category: 'Steel Work', vendor_name: 'IronForge Structures', amount: 890000, status: 'pending', sent_at: '2025-02-11 08:30', responded_at: null },
    ];
    setBids(mockBids);
    setLoading(false);
  }, []);

  const statusColors: Record<string, string> = {
    responded: 'tag-trial', approved: 'tag-active', pending: 'tag-unpaid',
    declined: 'tag-suspended', counter: 'tag-trial',
  };

  const filtered = bids.filter(b => {
    if (filter !== 'all' && b.status !== filter) return false;
    if (search && !b.project_name.toLowerCase().includes(search.toLowerCase()) && !b.vendor_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalValue = bids.reduce((s, b) => s + b.amount, 0);
  const responded = bids.filter(b => b.status !== 'pending').length;

  if (loading) return <p style={{ color: 'var(--muted)' }}>Loading...</p>;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card stat-card-v">
          <div className="stat-card-top">
            <div className="stat-lbl">Total Bids</div>
            <div className="stat-icon-r" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>📝</div>
          </div>
          <div className="stat-val">{bids.length}</div>
          <div className="stat-sub" style={{ color: 'var(--green)' }}>{responded} responded</div>
        </div>
        <div className="stat-card stat-card-v">
          <div className="stat-card-top">
            <div className="stat-lbl">Total Value</div>
            <div className="stat-icon-r" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>💰</div>
          </div>
          <div className="stat-val">${(totalValue / 1000).toFixed(0)}K</div>
          <div className="stat-sub" style={{ color: 'var(--muted)' }}>${(totalValue / bids.length / 1000).toFixed(0)}K avg</div>
        </div>
        <div className="stat-card stat-card-v">
          <div className="stat-card-top">
            <div className="stat-lbl">Response Rate</div>
            <div className="stat-icon-r" style={{ background: 'var(--gold-bg)', color: 'var(--gold)' }}>📊</div>
          </div>
          <div className="stat-val">{Math.round(responded / bids.length * 100)}%</div>
          <div className="stat-sub" style={{ color: 'var(--green)' }}>{bids.filter(b => b.status === 'approved').length} approved</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="table-title">📝 All Bid Requests</div>
          <div className="search-box">
            <span>🔍</span>
            <input placeholder="Search bids..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="filter-chips">
            {['all', 'pending', 'responded', 'approved', 'counter', 'declined'].map(f => (
              <span key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </span>
            ))}
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => toast('Export coming soon')}>⬇ Export</button>
        </div>

        <div className="bid-header">
          <div className="utbl-col">Project</div>
          <div className="utbl-col">Category</div>
          <div className="utbl-col">Vendor</div>
          <div className="utbl-col">Amount</div>
          <div className="utbl-col">Status</div>
          <div className="utbl-col">Sent</div>
        </div>

        {filtered.map(b => (
          <div key={b.id} className="bid-row">
            <div><div className="user-name" style={{ fontSize: '0.82rem' }}>{b.project_name}</div></div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ink2)' }}>{b.category}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ink2)' }}>{b.vendor_name}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--green)' }}>${b.amount.toLocaleString()}</div>
            <div><span className={`tag ${statusColors[b.status] || ''}`}>{b.status}</span></div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{b.sent_at}</div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>No bids found</div>
        )}
      </div>
    </>
  );
}
