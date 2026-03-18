'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../layout';

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState({
    admin_email: '',
    notification_email: '',
    auto_suspend_days: '14',
    auto_reminder_days: '3',
    has_admin_password: 'false',
  });
  const [saving, setSaving] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      setSettings(s => ({ ...s, ...d }));
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    toast('Settings saved!');
    setSaving(false);
  }

  async function changePassword() {
    if (!newPwd || newPwd.length < 8) { toast('Password must be at least 8 characters'); return; }
    if (newPwd !== confirmPwd) { toast('Passwords do not match'); return; }
    setChangingPwd(true);
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_password: newPwd }),
    });
    if (res.ok) {
      toast('Admin password updated!');
      setNewPwd('');
      setConfirmPwd('');
      setSettings(s => ({ ...s, has_admin_password: 'true' }));
    } else {
      const data = await res.json();
      toast(data.error || 'Failed to update password');
    }
    setChangingPwd(false);
  }

  return (
    <>
      <div className="scard">
        <div className="scard-head"><h3>General Settings</h3></div>
        <div className="finput-grid" style={{ marginBottom: 12 }}>
          <div className="fg">
            <label className="flbl">Admin Email</label>
            <input className="finput" value={settings.admin_email} onChange={e => setSettings({ ...settings, admin_email: e.target.value })} />
          </div>
          <div className="fg">
            <label className="flbl">Notification Email</label>
            <input className="finput" value={settings.notification_email} onChange={e => setSettings({ ...settings, notification_email: e.target.value })} />
          </div>
        </div>
        <div className="finput-grid" style={{ marginBottom: 12 }}>
          <div className="fg">
            <label className="flbl">Auto-suspend after unpaid (days)</label>
            <input className="finput" type="number" value={settings.auto_suspend_days} onChange={e => setSettings({ ...settings, auto_suspend_days: e.target.value })} />
          </div>
          <div className="fg">
            <label className="flbl">Auto-reminder before suspension (days)</label>
            <input className="finput" type="number" value={settings.auto_reminder_days} onChange={e => setSettings({ ...settings, auto_reminder_days: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-gold" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Settings'}</button>
        </div>
      </div>

      <div className="scard">
        <div className="scard-head">
          <h3>🔐 Admin Login Password</h3>
          {settings.has_admin_password === 'true' && (
            <span className="tag tag-active">Password Set</span>
          )}
          {settings.has_admin_password !== 'true' && (
            <span className="tag tag-unpaid">Using Default</span>
          )}
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
          {settings.has_admin_password === 'true'
            ? 'Your admin password is set. You can change it below.'
            : 'You are using the default password. Set a custom password for better security.'}
        </p>
        <div className="finput-grid" style={{ marginBottom: 12 }}>
          <div className="fg">
            <label className="flbl">New Password</label>
            <input className="finput" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 8 characters" />
          </div>
          <div className="fg">
            <label className="flbl">Confirm Password</label>
            <input className="finput" type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Repeat password" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-gold" disabled={changingPwd} onClick={changePassword}>
            {changingPwd ? 'Updating...' : settings.has_admin_password === 'true' ? 'Change Password' : 'Set Password'}
          </button>
        </div>
      </div>

      <div className="scard" style={{ background: 'var(--bg)', border: '1.5px dashed var(--border)' }}>
        <div className="scard-head"><h3>Login URL</h3></div>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          Access the admin panel at: <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>/admin-login</code>
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 8 }}>
          Use the admin email ({settings.admin_email || 'admin@bidmaster.app'}) and your password to log in.
        </p>
      </div>
    </>
  );
}
