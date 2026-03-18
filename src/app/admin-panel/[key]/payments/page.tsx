'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../layout';

interface Payment {
  id: string; name: string; email: string; date: string; amount: number; status: string; user_id?: string;
}

interface User {
  id: string; name: string; email: string;
}

export default function PaymentsPage() {
  const toast = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [failedAmount, setFailedAmount] = useState(0);
  const [payingUsers, setPayingUsers] = useState(0);
  const [showRecord, setShowRecord] = useState(false);

  // Record payment form
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [payAmount, setPayAmount] = useState('199');
  const [payStatus, setPayStatus] = useState('paid');

  function loadPayments() {
    fetch('/api/admin/payments').then(r => r.json()).then(d => {
      setPayments(d.payments || []);
      setMonthRevenue(d.monthRevenue || 0);
      setFailedAmount(d.failedAmount || 0);
      setPayingUsers(d.payingUsers || 0);
    });
  }

  useEffect(() => { loadPayments(); }, []);

  useEffect(() => {
    if (!userSearch) { setUserResults([]); return; }
    fetch(`/api/admin/users?search=${userSearch}&limit=5`).then(r => r.json()).then(d => setUserResults(d.users || []));
  }, [userSearch]);

  async function recordPayment() {
    if (!selectedUser) { toast('Select a user first'); return; }
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast('Enter a valid amount'); return; }

    await fetch('/api/admin/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: selectedUser.id, amount, status: payStatus }),
    });

    toast(`Payment of $${amount} recorded for ${selectedUser.name}`);
    setShowRecord(false);
    setSelectedUser(null);
    setUserSearch('');
    setPayAmount('199');
    loadPayments();
  }

  async function sendReminder(p: Payment) {
    await fetch('/api/admin/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: { type: 'custom', custom_ids: [p.user_id || p.id] },
        subject: 'Payment Reminder — BidMaster',
        body: `Hi ${p.name},\n\nThis is a reminder that your payment for BidMaster is overdue.\n\nAmount due: $${p.amount}\n\nPlease update your payment method.\n\nBidMaster Team`,
      }),
    });
    toast('Payment reminder sent to ' + p.name);
  }

  async function sendInvoice(p: Payment) {
    await fetch('/api/admin/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: { type: 'custom', custom_ids: [p.user_id || p.id] },
        subject: `Invoice #${p.id.slice(0, 8).toUpperCase()} — BidMaster`,
        body: `Hi ${p.name},\n\nHere is your invoice for BidMaster Pro.\n\nDate: ${p.date ? new Date(p.date).toLocaleDateString() : '-'}\nAmount: $${p.amount}\nStatus: Paid\n\nThank you for your business!\n\nBidMaster Team`,
      }),
    });
    toast('Invoice sent to ' + p.name);
  }

  return (
    <>
      <div className="stats-row-3">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-bg)' }}>💰</div>
          <div><div className="stat-val">${monthRevenue.toLocaleString()}</div><div className="stat-lbl">This month</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--red-bg)' }}>❌</div>
          <div><div className="stat-val">${failedAmount.toLocaleString()}</div><div className="stat-lbl">Failed / Unpaid</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)' }}>📈</div>
          <div><div className="stat-val">{payingUsers}</div><div className="stat-lbl">Paying users</div></div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-head">
          <div className="table-title">Payment History</div>
          <button className="btn btn-gold" style={{ marginLeft: 'auto' }} onClick={() => setShowRecord(true)}>+ Record Payment</button>
        </div>
        <div className="ptbl-header">
          <div className="utbl-col">User</div>
          <div className="utbl-col">Date</div>
          <div className="utbl-col">Amount</div>
          <div className="utbl-col">Status</div>
          <div className="utbl-col">Action</div>
        </div>
        {payments.map(p => (
          <div key={p.id} className="ptbl-row">
            <div>
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{p.email}</div>
            </div>
            <div style={{ color: 'var(--muted)' }}>{p.date ? new Date(p.date).toLocaleDateString() : '-'}</div>
            <div style={{ fontWeight: 700 }}>${p.amount}</div>
            <span className={`tag ${p.status === 'paid' ? 'tag-paid' : 'tag-failed'}`}>{p.status === 'paid' ? 'Paid' : 'Failed'}</span>
            {p.status === 'failed'
              ? <button className="btn btn-xs btn-gold" onClick={() => sendReminder(p)}>Remind</button>
              : <button className="btn btn-xs btn-outline" onClick={() => sendInvoice(p)}>Invoice</button>
            }
          </div>
        ))}
        {payments.length === 0 && <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: '0.85rem' }}>No payments yet</div>}
      </div>

      {/* Record Payment Modal */}
      {showRecord && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowRecord(false); }}>
          <div className="modal">
            <button className="modal-close" onClick={() => setShowRecord(false)}>×</button>
            <div className="modal-title">Record Payment</div>
            <div className="modal-sub">Manually record a payment for a user</div>

            <div className="fg">
              <label className="flbl">User</label>
              {selectedUser ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--gold-bg)', border: '1px solid var(--gold-b)', borderRadius: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedUser.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{selectedUser.email}</span>
                  <button style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)' }} onClick={() => setSelectedUser(null)}>×</button>
                </div>
              ) : (
                <>
                  <div className="search-box" style={{ maxWidth: '100%' }}>
                    <span>🔍</span>
                    <input placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                  </div>
                  {userResults.map(u => (
                    <div key={u.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg)', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', marginTop: 4 }}
                      onClick={() => { setSelectedUser(u); setUserSearch(''); setUserResults([]); }}>
                      <span style={{ fontWeight: 700 }}>{u.name}</span>
                      <span style={{ color: 'var(--muted)' }}>{u.email}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="finput-grid">
              <div className="fg">
                <label className="flbl">Amount ($)</label>
                <input className="finput" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="199" />
              </div>
              <div className="fg">
                <label className="flbl">Status</label>
                <select className="finput" value={payStatus} onChange={e => setPayStatus(e.target.value)}>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowRecord(false)}>Cancel</button>
              <button className="btn btn-gold" onClick={recordPayment}>Record Payment →</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
