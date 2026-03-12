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
  });
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="scard">
      <div className="scard-head"><h3>Admin Settings</h3></div>
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
      <div className="fg">
        <label className="flbl">Auto-suspend after unpaid (days)</label>
        <input className="finput" type="number" value={settings.auto_suspend_days} onChange={e => setSettings({ ...settings, auto_suspend_days: e.target.value })} style={{ maxWidth: 120 }} />
      </div>
      <div className="fg">
        <label className="flbl">Auto-reminder before suspension (days)</label>
        <input className="finput" type="number" value={settings.auto_reminder_days} onChange={e => setSettings({ ...settings, auto_reminder_days: e.target.value })} style={{ maxWidth: 120 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button className="btn btn-gold" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>
    </div>
  );
}
