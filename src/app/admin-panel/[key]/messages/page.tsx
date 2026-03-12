'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../layout';

const TEMPLATES = [
  { name: 'Payment Reminder', desc: 'For unpaid users', subject: 'Action Required: Payment Due for BidMaster', body: 'Hi {{name}},\n\nThis is a friendly reminder that your payment for BidMaster Pro is overdue.\n\nPlease update your payment method to avoid account suspension.\n\nAmount due: $199.00\n\nBidMaster Team' },
  { name: 'Suspension Warning', desc: 'Before suspending account', subject: 'Account Suspension Warning — BidMaster', body: 'Hi {{name}},\n\nYour BidMaster account will be suspended in 3 days due to an outstanding balance.\n\nTo keep your account active, please update your payment method immediately.\n\nBidMaster Team' },
  { name: 'Welcome Message', desc: 'For new signups', subject: 'Welcome to BidMaster!', body: 'Hi {{name}},\n\nWelcome to BidMaster! Your account is ready.\n\nYou can now:\n• Create projects and invite vendors\n• Manage bid requests\n• Compare bids and select winners\n\nBidMaster Team' },
  { name: 'Reactivation Offer', desc: 'Win back suspended users', subject: 'We miss you — Come back to BidMaster', body: 'Hi {{name}},\n\nWe noticed your account has been inactive. We\'d love to have you back!\n\nAs a returning customer, we\'re offering you one month free.\n\nBidMaster Team' },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  return `${Math.floor(days / 7)} weeks ago`;
}

export default function MessagesPage() {
  const toast = useToast();
  const [recipientType, setRecipientType] = useState('all');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  // Custom recipients
  const [customSearch, setCustomSearch] = useState('');
  const [customResults, setCustomResults] = useState<any[]>([]);
  const [customTags, setCustomTags] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/admin/messages').then(r => r.json()).then(d => setHistory(d.messages || []));
  }, []);

  useEffect(() => {
    if (recipientType !== 'custom' || !customSearch) { setCustomResults([]); return; }
    fetch(`/api/admin/users?search=${customSearch}&limit=5`).then(r => r.json()).then(d => setCustomResults(d.users || []));
  }, [customSearch, recipientType]);

  async function sendMessage() {
    if (!subject || !body) { toast('Please fill in subject and message'); return; }
    setSending(true);
    const recipients = recipientType === 'custom'
      ? { type: 'custom', custom_ids: customTags.map(t => t.id) }
      : { type: recipientType };
    const res = await fetch('/api/admin/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients, subject, body }),
    });
    const data = await res.json();
    toast(`Message sent to ${data.sent} users`);
    setSubject(''); setBody('');
    setSending(false);
    // Refresh history
    fetch('/api/admin/messages').then(r => r.json()).then(d => setHistory(d.messages || []));
  }

  function loadTemplate(t: typeof TEMPLATES[0]) {
    setSubject(t.subject);
    setBody(t.body);
    toast('Template loaded');
  }

  const recipientLabels: Record<string, string> = { all: 'All Users', active: 'Active', trial: 'Trial', unpaid: 'Unpaid', suspended: 'Suspended', custom: 'Custom...' };

  return (
    <div className="grid-2-sidebar">
      {/* Compose */}
      <div>
        <div className="scard">
          <div className="scard-head"><h3>✉️ Send Message to Users</h3></div>
          <div className="fg">
            <label className="flbl">Recipients</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {Object.entries(recipientLabels).map(([key, label]) => (
                <div key={key} className={`chip ${recipientType === key ? 'on' : ''}`} onClick={() => setRecipientType(key)}>{label}</div>
              ))}
            </div>
            {recipientType === 'custom' && (
              <div style={{ marginBottom: 10 }}>
                <div className="search-box" style={{ maxWidth: '100%' }}>
                  <span>🔍</span>
                  <input placeholder="Search users to add..." value={customSearch} onChange={e => setCustomSearch(e.target.value)} />
                </div>
                {customResults.map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg)', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', marginTop: 4 }}
                    onClick={() => { if (!customTags.find(t => t.id === u.id)) setCustomTags([...customTags, { id: u.id, name: u.name }]); setCustomSearch(''); }}>
                    <span style={{ fontWeight: 700 }}>{u.name}</span>
                    <span style={{ color: 'var(--muted)' }}>{u.email}</span>
                  </div>
                ))}
              </div>
            )}
            {recipientType === 'custom' && customTags.length > 0 && (
              <div className="recipient-tags">
                {customTags.map(t => (
                  <div key={t.id} className="rtag">
                    {t.name} <button onClick={() => setCustomTags(customTags.filter(x => x.id !== t.id))}>×</button>
                  </div>
                ))}
              </div>
            )}
            {recipientType !== 'custom' && (
              <div className="recipient-tags">
                <div className="rtag">{recipientLabels[recipientType]}</div>
              </div>
            )}
          </div>
          <div className="fg">
            <label className="flbl">Subject</label>
            <input className="finput" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Important update about your account" />
          </div>
          <div className="fg">
            <label className="flbl">Message</label>
            <textarea className="finput" rows={6} value={body} onChange={e => setBody(e.target.value)}
              placeholder={'Write your message here...\n\nYou can use: {{name}}, {{email}}, {{plan}}'}
              style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button className="btn btn-outline" onClick={() => {
              if (!body) { toast('Write a message first'); return; }
              alert('Preview:\n\n' + body.replace(/\{\{name\}\}/g, 'James Robertson').replace(/\{\{email\}\}/g, 'james@company.com').replace(/\{\{plan\}\}/g, 'Pro'));
            }}>👁 Preview</button>
            <button className="btn btn-gold" disabled={sending} onClick={sendMessage}>{sending ? 'Sending...' : 'Send Message →'}</button>
          </div>
        </div>
      </div>

      {/* Sidebar: Templates + History */}
      <div>
        <div className="scard">
          <div className="scard-head"><h3>📨 Message Templates</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TEMPLATES.map(t => (
              <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', cursor: 'pointer' }}
                onClick={() => loadTemplate(t)}>
                <div><div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{t.name}</div><div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{t.desc}</div></div>
                <button className="btn btn-xs btn-outline">Use</button>
              </div>
            ))}
          </div>
        </div>
        <div className="scard">
          <div className="scard-head"><h3>📊 Last Sent</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.slice(0, 5).map(m => (
              <div key={m.id} style={{ fontSize: '0.78rem', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700 }}>{m.subject}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>Sent to {m.recipient_count} users · {timeAgo(m.sent_at)}</div>
              </div>
            ))}
            {history.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>No messages sent yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
