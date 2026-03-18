'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../layout';

interface Project {
  id: number;
  name: string;
  user_name: string;
  status: string;
  bid_count: number;
  created_at: string;
  budget: number;
}

export default function ProjectsPage() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(d => {
      // Use mock data since we may not have a projects endpoint yet
      const mockProjects: Project[] = [
        { id: 1, name: 'Downtown Office Complex', user_name: 'John Smith', status: 'active', bid_count: 8, created_at: '2026-02-10', budget: 2500000 },
        { id: 2, name: 'Highway Bridge Construction', user_name: 'Mike Rodriguez', status: 'active', bid_count: 12, created_at: '2026-02-08', budget: 5800000 },
        { id: 3, name: 'Residential Tower Phase 2', user_name: 'Sarah Johnson', status: 'bidding', bid_count: 5, created_at: '2026-02-05', budget: 3200000 },
        { id: 4, name: 'School Renovation Project', user_name: 'Emily Chen', status: 'completed', bid_count: 6, created_at: '2026-01-20', budget: 890000 },
        { id: 5, name: 'Hospital Wing Extension', user_name: 'John Smith', status: 'active', bid_count: 15, created_at: '2026-01-15', budget: 12000000 },
        { id: 6, name: 'Parking Garage Construction', user_name: 'Lisa Anderson', status: 'draft', bid_count: 0, created_at: '2026-02-12', budget: 1500000 },
        { id: 7, name: 'Shopping Mall Remodel', user_name: 'Sarah Johnson', status: 'bidding', bid_count: 9, created_at: '2026-02-01', budget: 4200000 },
        { id: 8, name: 'Water Treatment Plant', user_name: 'Mike Rodriguez', status: 'active', bid_count: 7, created_at: '2026-01-28', budget: 8500000 },
      ];
      setProjects(mockProjects);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const statusColors: Record<string, string> = {
    active: 'tag-active', bidding: 'tag-trial', completed: 'tag-paid', draft: 'tag-unpaid',
  };

  const filtered = projects.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.user_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalBids = projects.reduce((s, p) => s + p.bid_count, 0);

  if (loading) return <p style={{ color: 'var(--muted)' }}>Loading...</p>;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card stat-card-v">
          <div className="stat-card-top">
            <div className="stat-lbl">Total Projects</div>
            <div className="stat-icon-r" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>📁</div>
          </div>
          <div className="stat-val">{projects.length}</div>
          <div className="stat-sub" style={{ color: 'var(--green)' }}>{projects.filter(p => p.status === 'active').length} active</div>
        </div>
        <div className="stat-card stat-card-v">
          <div className="stat-card-top">
            <div className="stat-lbl">Total Budget</div>
            <div className="stat-icon-r" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>💰</div>
          </div>
          <div className="stat-val">${(totalBudget / 1000000).toFixed(1)}M</div>
          <div className="stat-sub" style={{ color: 'var(--muted)' }}>across all projects</div>
        </div>
        <div className="stat-card stat-card-v">
          <div className="stat-card-top">
            <div className="stat-lbl">Total Bids</div>
            <div className="stat-icon-r" style={{ background: 'var(--gold-bg)', color: 'var(--gold)' }}>📝</div>
          </div>
          <div className="stat-val">{totalBids}</div>
          <div className="stat-sub" style={{ color: 'var(--muted)' }}>{(totalBids / projects.length).toFixed(1)} avg per project</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="table-title">📁 All Projects</div>
          <div className="search-box">
            <span>🔍</span>
            <input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="filter-chips">
            {['all', 'active', 'bidding', 'completed', 'draft'].map(f => (
              <span key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </span>
            ))}
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => toast('Export coming soon')}>⬇ Export</button>
        </div>

        <div className="proj-header">
          <div className="utbl-col">Project</div>
          <div className="utbl-col">Owner</div>
          <div className="utbl-col">Status</div>
          <div className="utbl-col">Bids</div>
          <div className="utbl-col">Budget</div>
          <div className="utbl-col">Created</div>
        </div>

        {filtered.map(p => (
          <div key={p.id} className="proj-row">
            <div><div className="user-name">{p.name}</div></div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ink2)' }}>{p.user_name}</div>
            <div><span className={`tag ${statusColors[p.status] || ''}`}>{p.status}</span></div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{p.bid_count}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>${(p.budget / 1000000).toFixed(1)}M</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{p.created_at}</div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>No projects found</div>
        )}
      </div>
    </>
  );
}
