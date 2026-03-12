'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../layout';

interface Payment {
  id: string; name: string; email: string; date: string; amount: number; status: string;
}

export default function PaymentsPage() {
  const toast = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [failedAmount, setFailedAmount] = useState(0);
  const [payingUsers, setPayingUsers] = useState(0);

  useEffect(() => {
    fetch('/api/admin/payments').then(r => r.json()).then(d => {
      setPayments(d.payments || []);
      setMonthRevenue(d.monthRevenue || 0);
      setFailedAmount(d.failedAmount || 0);
      setPayingUsers(d.payingUsers || 0);
    });
  }, []);

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
        <div className="table-head"><div className="table-title">Payment History</div></div>
        <div className="ptbl-header">
          <div className="utbl-col">User</div>
          <div className="utbl-col">Date</div>
          <div className="utbl-col">Amount</div>
          <div className="utbl-col">Status</div>
          <div className="utbl-col">Action</div>
        </div>
        {payments.map(p => (
          <div key={p.id} className="ptbl-row">
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div style={{ color: 'var(--muted)' }}>{p.date ? new Date(p.date).toLocaleDateString() : '-'}</div>
            <div style={{ fontWeight: 700 }}>${p.amount}</div>
            <span className={`tag ${p.status === 'paid' ? 'tag-paid' : 'tag-failed'}`}>{p.status === 'paid' ? 'Paid' : 'Failed'}</span>
            {p.status === 'failed'
              ? <button className="btn btn-xs btn-gold" onClick={() => toast('Reminder sent!')}>Remind</button>
              : <button className="btn btn-xs btn-outline" onClick={() => toast('Invoice sent!')}>Invoice</button>
            }
          </div>
        ))}
        {payments.length === 0 && <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: '0.85rem' }}>No payments yet</div>}
      </div>
    </>
  );
}
