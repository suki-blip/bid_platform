'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface UserData {
  id: string;
  name: string;
  company: string;
  email: string;
  plan: string;
  status: string;
  joined: string;
}

interface NotifSettings {
  clerk_email?: string;
  clerk_name?: string;
  auto_notify_winner?: boolean;
  auto_notify_losers?: boolean;
  auto_notify_clerk?: boolean;
  cc_emails?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  can_view_budget: number;
  status: string;
  project_ids: string[];
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

function showToast(msg: string) {
  const el = document.getElementById('bm-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(12px)'; }, 2200);
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);

  // Password change
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // Notification settings
  const [notif, setNotif] = useState<NotifSettings>({
    auto_notify_winner: true,
    auto_notify_losers: true,
    auto_notify_clerk: false,
  });
  const [savingNotif, setSavingNotif] = useState(false);

  // Team management
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [tmName, setTmName] = useState('');
  const [tmEmail, setTmEmail] = useState('');
  const [tmPassword, setTmPassword] = useState('');
  const [tmRole, setTmRole] = useState<'viewer' | 'editor'>('viewer');
  const [tmBudget, setTmBudget] = useState(false);
  const [tmProjectIds, setTmProjectIds] = useState<Set<string>>(new Set());
  const [tmAllProjects, setTmAllProjects] = useState(true);
  const [savingTeam, setSavingTeam] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(u => {
      if (u) {
        setUser(u);
        setName(u.name || '');
        setCompany(u.company || '');
      }
    });
    fetch('/api/auth/notification-settings').then(r => r.ok ? r.json() : {}).then(s => {
      if (s && Object.keys(s).length > 0) setNotif(prev => ({ ...prev, ...s }));
    }).catch(() => {});
    loadTeam();
    fetch('/api/projects').then(r => r.ok ? r.json() : []).then(p => setProjects(Array.isArray(p) ? p : [])).catch(() => {});
  }, []);

  function loadTeam() {
    fetch('/api/team').then(r => r.ok ? r.json() : []).then(setTeamMembers).catch(() => {});
  }

  function resetTeamForm() {
    setTmName(''); setTmEmail(''); setTmPassword(''); setTmRole('viewer');
    setTmBudget(false); setTmProjectIds(new Set()); setTmAllProjects(true);
    setEditingMember(null); setShowAddTeam(false);
  }

  function openEditMember(m: TeamMember) {
    setEditingMember(m);
    setTmName(m.name);
    setTmEmail(m.email);
    setTmPassword('');
    setTmRole(m.role as 'viewer' | 'editor');
    setTmBudget(!!m.can_view_budget);
    setTmAllProjects(m.project_ids.length === 0);
    setTmProjectIds(new Set(m.project_ids));
    setShowAddTeam(true);
  }

  async function saveTeamMember() {
    if (!tmName || !tmEmail) { showToast('Name and email required'); return; }
    if (!editingMember && !tmPassword) { showToast('Password required'); return; }
    setSavingTeam(true);
    const projectIds = tmAllProjects ? [] : Array.from(tmProjectIds);
    if (editingMember) {
      const body: any = { name: tmName, role: tmRole, can_view_budget: tmBudget, project_ids: projectIds };
      if (tmPassword) body.password = tmPassword;
      const res = await fetch(`/api/team/${editingMember.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { showToast('Team member updated'); resetTeamForm(); loadTeam(); }
      else { const e = await res.json(); showToast(e.error || 'Failed'); }
    } else {
      const res = await fetch('/api/team', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tmName, email: tmEmail, password: tmPassword, role: tmRole, can_view_budget: tmBudget, project_ids: projectIds }),
      });
      if (res.ok) { showToast('Team member added'); resetTeamForm(); loadTeam(); }
      else { const e = await res.json(); showToast(e.error || 'Failed'); }
    }
    setSavingTeam(false);
  }

  async function toggleTeamStatus(m: TeamMember) {
    const newStatus = m.status === 'active' ? 'suspended' : 'active';
    await fetch(`/api/team/${m.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    showToast(`${m.name} ${newStatus}`);
    loadTeam();
  }

  async function deleteTeamMember(m: TeamMember) {
    if (!confirm(`Remove ${m.name} from your team?`)) return;
    await fetch(`/api/team/${m.id}`, { method: 'DELETE' });
    showToast(`${m.name} removed`);
    loadTeam();
  }

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, company }),
    });
    if (res.ok) {
      showToast('Profile updated');
    } else {
      showToast('Failed to update');
    }
    setSaving(false);
  }

  async function changePassword() {
    if (newPwd.length < 8) { showToast('Password must be at least 8 characters'); return; }
    if (newPwd !== confirmPwd) { showToast('Passwords do not match'); return; }
    setChangingPwd(true);
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Password changed');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } else {
      showToast(data.error || 'Failed to change password');
    }
    setChangingPwd(false);
  }

  async function saveNotifSettings() {
    setSavingNotif(true);
    const res = await fetch('/api/auth/notification-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notif),
    });
    if (res.ok) {
      showToast('Notification settings saved');
    } else {
      showToast('Failed to save');
    }
    setSavingNotif(false);
  }

  if (!user) return <div className="page on"><div className="scroll"><p style={{ color: 'var(--muted)' }}>Loading...</p></div></div>;

  const checkStyle: React.CSSProperties = {
    accentColor: 'var(--gold)', width: 16, height: 16, cursor: 'pointer',
  };
  const checkLabelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer',
    fontSize: '0.84rem', fontWeight: 600, color: 'var(--ink)',
  };
  const checkDescStyle: React.CSSProperties = {
    fontSize: '0.74rem', color: 'var(--muted)', fontWeight: 400, marginTop: 1,
  };

  return (
    <div className="page on">
      <div className="scroll">
        {/* Profile */}
        <div className="scard" style={{ maxWidth: 640 }}>
          <div className="scard-head"><h3>Profile</h3></div>
          <div className="scard-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="fg">
                <label className="flbl">Full Name</label>
                <input className="finput" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="fg">
                <label className="flbl">Company</label>
                <input className="finput" value={company} onChange={e => setCompany(e.target.value)} />
              </div>
            </div>
            <div className="fg" style={{ marginBottom: 14 }}>
              <label className="flbl">Email</label>
              <input className="finput" value={user.email} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-gold" onClick={saveProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Member since {user.joined ? new Date(user.joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Email & Notification Settings */}
        <div className="scard" style={{ maxWidth: 640 }}>
          <div className="scard-head"><h3>Email Notifications</h3></div>
          <div className="scard-body">
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 0, marginBottom: 16 }}>
              Configure default email notification settings when selecting a winner.
            </p>

            <label style={checkLabelStyle}>
              <input type="checkbox" checked={notif.auto_notify_winner !== false} onChange={e => setNotif({ ...notif, auto_notify_winner: e.target.checked })} style={checkStyle} />
              <div>
                Notify winning vendor
                <div style={checkDescStyle}>Send congratulations email to the selected vendor</div>
              </div>
            </label>

            <label style={checkLabelStyle}>
              <input type="checkbox" checked={notif.auto_notify_losers !== false} onChange={e => setNotif({ ...notif, auto_notify_losers: e.target.checked })} style={checkStyle} />
              <div>
                Notify other vendors
                <div style={checkDescStyle}>Send notification to vendors who were not selected</div>
              </div>
            </label>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 6 }}>
              <label style={checkLabelStyle}>
                <input type="checkbox" checked={!!notif.auto_notify_clerk} onChange={e => setNotif({ ...notif, auto_notify_clerk: e.target.checked })} style={checkStyle} />
                <div>
                  Auto-send to office / clerk
                  <div style={checkDescStyle}>Automatically send winner details to your office clerk when selecting a winner</div>
                </div>
              </label>

              <div style={{ paddingLeft: 26 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="fg">
                    <label className="flbl">Clerk Name</label>
                    <input
                      className="finput"
                      value={notif.clerk_name || ''}
                      onChange={e => setNotif({ ...notif, clerk_name: e.target.value })}
                      placeholder="e.g. Sarah"
                    />
                  </div>
                  <div className="fg">
                    <label className="flbl">Clerk Email *</label>
                    <input
                      className="finput"
                      type="email"
                      value={notif.clerk_email || ''}
                      onChange={e => setNotif({ ...notif, clerk_email: e.target.value })}
                      placeholder="clerk@company.com"
                    />
                  </div>
                </div>

                <div className="fg" style={{ marginBottom: 10 }}>
                  <label className="flbl">CC Emails (comma separated)</label>
                  <input
                    className="finput"
                    value={notif.cc_emails || ''}
                    onChange={e => setNotif({ ...notif, cc_emails: e.target.value })}
                    placeholder="manager@company.com, accounting@company.com"
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 4 }}>
                    Additional emails that will receive the winner notification
                  </div>
                </div>
              </div>
            </div>

            <button className="btn btn-gold" onClick={saveNotifSettings} disabled={savingNotif} style={{ marginTop: 8 }}>
              {savingNotif ? 'Saving...' : 'Save Notification Settings'}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="scard" style={{ maxWidth: 640 }}>
          <div className="scard-head"><h3>Change Password</h3></div>
          <div className="scard-body">
            <div className="fg" style={{ marginBottom: 14 }}>
              <label className="flbl">Current Password</label>
              <input className="finput" type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="Enter current password" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="fg">
                <label className="flbl">New Password</label>
                <input className="finput" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 8 characters" />
              </div>
              <div className="fg">
                <label className="flbl">Confirm New Password</label>
                <input className="finput" type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Repeat password" />
              </div>
            </div>
            <button className="btn btn-outline" onClick={changePassword} disabled={changingPwd}>
              {changingPwd ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </div>

        {/* Team Management */}
        <div className="scard" style={{ maxWidth: 640 }}>
          <div className="scard-head">
            <h3>Team Members</h3>
            <button className="btn btn-gold btn-xs" onClick={() => { resetTeamForm(); setShowAddTeam(true); }}>+ Add Member</button>
          </div>
          <div className="scard-body">
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 0, marginBottom: 14 }}>
              Invite team members to view projects. Viewers are free. Editors ($49/mo each) can create and edit bids.
            </p>

            {teamMembers.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>
                No team members yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teamMembers.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: m.role === 'editor' ? 'var(--blue-bg)' : 'var(--gold-bg)',
                      color: m.role === 'editor' ? 'var(--blue)' : 'var(--gold)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.7rem', flexShrink: 0,
                    }}>
                      {m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--ink)' }}>{m.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                        {m.email}
                        {m.project_ids.length > 0 && ` · ${m.project_ids.length} project${m.project_ids.length > 1 ? 's' : ''}`}
                        {m.project_ids.length === 0 && ' · All projects'}
                      </div>
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: 5, fontSize: '0.68rem', fontWeight: 700,
                      background: m.role === 'editor' ? 'var(--blue-bg)' : 'var(--bg)',
                      color: m.role === 'editor' ? 'var(--blue)' : 'var(--muted)',
                      border: '1px solid var(--border)',
                    }}>
                      {m.role}
                    </span>
                    {m.status === 'suspended' && (
                      <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: '0.68rem', fontWeight: 700, background: 'var(--red-bg)', color: 'var(--red)' }}>
                        suspended
                      </span>
                    )}
                    <button onClick={() => openEditMember(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 600 }}>Edit</button>
                    <button onClick={() => toggleTeamStatus(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {m.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                    <button onClick={() => deleteTeamMember(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--red)' }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Team Member Modal */}
        {showAddTeam && typeof document !== 'undefined' && createPortal(
          <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) resetTeamForm(); }}>
            <div className="modal" style={{ maxWidth: 440 }}>
              <button className="modal-close" onClick={resetTeamForm}>x</button>
              <div className="modal-title">{editingMember ? 'Edit Team Member' : 'Add Team Member'}</div>
              <div className="modal-sub">{editingMember ? `Editing ${editingMember.name}` : 'Invite someone to your team'}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div className="fg">
                  <label className="flbl">Name *</label>
                  <input className="finput" value={tmName} onChange={e => setTmName(e.target.value)} placeholder="John Smith" />
                </div>
                <div className="fg">
                  <label className="flbl">Email *</label>
                  <input className="finput" type="email" value={tmEmail} onChange={e => setTmEmail(e.target.value)} placeholder="john@company.com" disabled={!!editingMember} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div className="fg">
                  <label className="flbl">{editingMember ? 'New Password (optional)' : 'Password *'}</label>
                  <input className="finput" type="password" value={tmPassword} onChange={e => setTmPassword(e.target.value)} placeholder="Min 8 chars" />
                </div>
                <div className="fg">
                  <label className="flbl">Role</label>
                  <select className="finput" value={tmRole} onChange={e => setTmRole(e.target.value as 'viewer' | 'editor')}>
                    <option value="viewer">Viewer (Free)</option>
                    <option value="editor">Editor (+$49/mo)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={tmBudget} onChange={e => setTmBudget(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                  Can view project budgets
                </label>
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 14, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 8, color: 'var(--ink)' }}>Project Access</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', marginBottom: 8 }}>
                  <input type="radio" checked={tmAllProjects} onChange={() => setTmAllProjects(true)} style={{ accentColor: 'var(--gold)' }} />
                  All projects
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', marginBottom: 8 }}>
                  <input type="radio" checked={!tmAllProjects} onChange={() => setTmAllProjects(false)} style={{ accentColor: 'var(--gold)' }} />
                  Specific projects only
                </label>
                {!tmAllProjects && (
                  <div style={{ maxHeight: 150, overflow: 'auto', paddingLeft: 20 }}>
                    {projects.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--ink)', cursor: 'pointer', marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={tmProjectIds.has(p.id)}
                          onChange={e => {
                            const s = new Set(tmProjectIds);
                            if (e.target.checked) s.add(p.id); else s.delete(p.id);
                            setTmProjectIds(s);
                          }}
                          style={{ accentColor: 'var(--gold)' }}
                        />
                        {p.name}
                      </label>
                    ))}
                    {projects.length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>No projects yet</div>}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="btn btn-outline" onClick={resetTeamForm}>Cancel</button>
                <button className="btn btn-gold" onClick={saveTeamMember} disabled={savingTeam}>
                  {savingTeam ? 'Saving...' : editingMember ? 'Update Member' : 'Add Member'}
                </button>
              </div>
            </div>
          </div>, document.body
        )}

        {/* Account Info */}
        <div className="scard" style={{ maxWidth: 640 }}>
          <div className="scard-head"><h3>Account</h3></div>
          <div className="scard-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Plan</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{user.plan}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Status</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: user.status === 'active' ? 'var(--green)' : user.status === 'trial' ? 'var(--blue)' : 'var(--red)' }}>
                  {user.status === 'active' ? 'Active' : user.status === 'trial' ? 'Trial' : user.status === 'pending' ? 'Pending' : user.status}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
