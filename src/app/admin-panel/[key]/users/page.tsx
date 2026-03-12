'use client';

import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../layout';

interface User {
  id: string; name: string; company: string; email: string;
  status: string; payment: string; plan: string; joined: string; last_login: string;
}

function initials(name: string) { return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
const avColors = [['#dbeafe','var(--blue)'],['#dcfce7','var(--green)'],['#fef3c7','var(--gold)'],['#f3e8ff','#9333ea'],['#ffe4e6','var(--red)']];
function avColor(id: string) { return avColors[id.charCodeAt(0) % 5]; }

function StatusTag({ status }: { status: string }) {
  const cls = status === 'active' ? 'tag-active' : status === 'trial' ? 'tag-trial' : 'tag-suspended';
  return <span className={`tag ${cls}`}>{status}</span>;
}
function PaymentTag({ payment }: { payment: string }) {
  const cls = payment === 'paid' ? 'tag-paid' : payment === 'unpaid' ? 'tag-unpaid' : 'tag-trial';
  return <span className={`tag ${cls}`}>{payment}</span>;
}

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<'detail' | 'add' | 'password' | null>(null);
  const [activeUser, setActiveUser] = useState<User | null>(null);

  // Add user form
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPlan, setNewPlan] = useState('trial');

  // Change password form
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');

  const loadUsers = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filter !== 'all') params.set('filter', filter);
    fetch(`/api/admin/users?${params}`).then(r => r.json()).then(d => {
      setUsers(d.users || []);
      setTotal(d.total || 0);
    });
  }, [search, filter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  function toggleSelect(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  }
  function toggleAll() {
    if (selected.size === users.length) setSelected(new Set());
    else setSelected(new Set(users.map(u => u.id)));
  }

  async function toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    toast(`User ${newStatus}`);
    loadUsers();
  }

  async function bulkAction(action: 'suspend' | 'activate') {
    const status = action === 'suspend' ? 'suspended' : 'active';
    for (const id of selected) {
      await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    }
    toast(`${selected.size} users ${action}d`);
    setSelected(new Set());
    loadUsers();
  }

  async function addUser() {
    if (!newName || !newEmail || !newPassword) { toast('Fill in required fields'); return; }
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, company: newCompany, email: newEmail, password: newPassword, plan: newPlan === 'trial' ? 'Trial' : 'Pro' }),
    });
    if (!res.ok) { const e = await res.json(); toast(e.error); return; }
    toast('Account created for ' + newName);
    setModal(null); setNewName(''); setNewCompany(''); setNewEmail(''); setNewPassword('');
    loadUsers();
  }

  async function changePassword() {
    if (!pwd1 || pwd1.length < 8) { toast('Password must be at least 8 characters'); return; }
    if (pwd1 !== pwd2) { toast('Passwords do not match'); return; }
    await fetch(`/api/admin/users/${activeUser?.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd1 }),
    });
    toast('Password updated for ' + activeUser?.name);
    setModal(null); setPwd1(''); setPwd2('');
  }

  return (
    <>
      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} users selected</span>
          <button className="btn btn-xs btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} onClick={() => bulkAction('suspend')}>⏸ Suspend</button>
          <button className="btn btn-xs btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} onClick={() => bulkAction('activate')}>✅ Activate</button>
          <button className="btn btn-xs" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }} onClick={() => setSelected(new Set())}>✕ Clear</button>
        </div>
      )}

      <div className="table-card">
        <div className="table-head" style={{ gap: 10 }}>
          <div className="table-title">All Users ({total})</div>
          <div className="search-box">
            <span style={{ color: 'var(--muted)' }}>🔍</span>
            <input placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="filter-chips">
            {['all', 'active', 'trial', 'unpaid', 'suspended'].map(f => (
              <div key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </div>
            ))}
          </div>
          <button className="btn btn-gold" onClick={() => setModal('add')}>+ Add User</button>
        </div>

        <div className="utbl-header">
          <div><input type="checkbox" className="user-checkbox" checked={selected.size === users.length && users.length > 0} onChange={toggleAll} /></div>
          <div className="utbl-col">User</div>
          <div className="utbl-col">Email</div>
          <div className="utbl-col">Status</div>
          <div className="utbl-col">Payment</div>
          <div className="utbl-col">Joined</div>
          <div className="utbl-col">Actions</div>
        </div>

        {users.map(u => {
          const [bg, fg] = avColor(u.id);
          return (
            <div key={u.id} className="utbl-row" onClick={() => { setActiveUser(u); setModal('detail'); }}>
              <input type="checkbox" className="user-checkbox" checked={selected.has(u.id)} onChange={e => { e.stopPropagation(); toggleSelect(u.id); }} onClick={e => e.stopPropagation()} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="user-av" style={{ background: bg, color: fg }}>{initials(u.name)}</div>
                <div><div className="user-name">{u.name}</div><div className="user-email">{u.company}</div></div>
              </div>
              <div className="user-email" style={{ fontSize: '0.78rem' }}>{u.email}</div>
              <StatusTag status={u.status} />
              <PaymentTag payment={u.payment} />
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{u.joined ? new Date(u.joined).toLocaleDateString() : '-'}</div>
              <div onClick={e => e.stopPropagation()}>
                {u.status === 'suspended'
                  ? <button className="btn btn-xs btn-green" onClick={() => toggleStatus(u.id, u.status)}>Activate</button>
                  : <button className="btn btn-xs btn-outline" onClick={() => toggleStatus(u.id, u.status)}>Suspend</button>
                }
              </div>
            </div>
          );
        })}
        {users.length === 0 && <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: '0.85rem' }}>No users found</div>}
      </div>

      {/* User Detail Modal */}
      {modal === 'detail' && activeUser && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal modal-lg">
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
            <div className="modal-title">{activeUser.name}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <StatusTag status={activeUser.status} />
              <PaymentTag payment={activeUser.payment} />
            </div>
            <div className="info-grid">
              <div className="info-box"><div className="info-label">Company</div><div className="info-value">{activeUser.company || '-'}</div></div>
              <div className="info-box"><div className="info-label">Email</div><div className="info-value">{activeUser.email}</div></div>
              <div className="info-box"><div className="info-label">Plan</div><div className="info-value">{activeUser.plan}</div></div>
              <div className="info-box"><div className="info-label">Last Login</div><div className="info-value">{activeUser.last_login || 'Never'}</div></div>
              <div className="info-box"><div className="info-label">Joined</div><div className="info-value">{activeUser.joined ? new Date(activeUser.joined).toLocaleDateString() : '-'}</div></div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {activeUser.status === 'suspended'
                ? <button className="btn btn-sm btn-green" onClick={() => { toggleStatus(activeUser.id, activeUser.status); setModal(null); }}>✅ Activate Account</button>
                : <button className="btn btn-sm btn-outline" onClick={() => { toggleStatus(activeUser.id, activeUser.status); setModal(null); }}>⏸ Suspend Account</button>
              }
              {activeUser.payment === 'unpaid' && (
                <button className="btn btn-sm btn-gold" onClick={() => {
                  fetch('/api/admin/messages', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      recipients: { type: 'custom', custom_ids: [activeUser.id] },
                      subject: 'Payment Reminder — BidMaster',
                      body: `Hi ${activeUser.name},\n\nYour payment for BidMaster is overdue.\n\nPlease update your payment method.\n\nBidMaster Team`,
                    }),
                  }).then(() => toast('Reminder sent'));
                }}>📧 Send Reminder</button>
              )}
              <button className="btn btn-sm btn-outline" onClick={() => { setModal('password'); }}>🔑 Change Password</button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {modal === 'add' && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal">
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
            <div className="modal-title">Add New User</div>
            <div className="modal-sub">Create a new BidMaster account</div>
            <div className="finput-grid">
              <div className="fg"><label className="flbl">Full Name *</label><input className="finput" value={newName} onChange={e => setNewName(e.target.value)} placeholder="James Robertson" /></div>
              <div className="fg"><label className="flbl">Company</label><input className="finput" value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Robertson LLC" /></div>
            </div>
            <div className="fg"><label className="flbl">Email *</label><input className="finput" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="james@company.com" /></div>
            <div className="finput-grid">
              <div className="fg"><label className="flbl">Password *</label><input className="finput" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 chars" /></div>
              <div className="fg"><label className="flbl">Plan</label>
                <select className="finput" value={newPlan} onChange={e => setNewPlan(e.target.value)}>
                  <option value="trial">Trial (14 days)</option>
                  <option value="pro">Pro - $199/mo</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={addUser}>Create Account →</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {modal === 'password' && activeUser && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal modal-sm">
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
            <div className="modal-title">Change Password</div>
            <div className="modal-sub">For: {activeUser.name}</div>
            <div className="fg"><label className="flbl">New Password *</label><input className="finput" type="password" value={pwd1} onChange={e => setPwd1(e.target.value)} placeholder="Min 8 characters" /></div>
            <div className="fg"><label className="flbl">Confirm Password *</label><input className="finput" type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} placeholder="Repeat password" /></div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={changePassword}>Update Password →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
