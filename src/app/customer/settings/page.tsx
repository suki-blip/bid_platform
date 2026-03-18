'use client';

import { useEffect, useState } from 'react';

interface UserData {
  id: string;
  name: string;
  company: string;
  email: string;
  plan: string;
  status: string;
  joined: string;
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

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(u => {
      if (u) {
        setUser(u);
        setName(u.name || '');
        setCompany(u.company || '');
      }
    });
  }, []);

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

  if (!user) return <div className="page on"><div className="scroll"><p style={{ color: 'var(--muted)' }}>Loading...</p></div></div>;

  return (
    <div className="page on">
      <div className="scroll">
        {/* Profile */}
        <div className="scard" style={{ maxWidth: 640 }}>
          <div className="scard-head"><h3>{'\u270F\uFE0F'} Profile</h3></div>
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

        {/* Change Password */}
        <div className="scard" style={{ maxWidth: 640 }}>
          <div className="scard-head"><h3>{'\uD83D\uDD12'} Change Password</h3></div>
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

        {/* Account Info */}
        <div className="scard" style={{ maxWidth: 640 }}>
          <div className="scard-head"><h3>{'\uD83D\uDCCB'} Account</h3></div>
          <div className="scard-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Plan</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{user.plan}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Status</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: user.status === 'active' ? 'var(--green)' : user.status === 'trial' ? 'var(--blue)' : 'var(--red)' }}>
                  {user.status === 'active' ? 'Active' : user.status === 'trial' ? 'Trial' : user.status}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
