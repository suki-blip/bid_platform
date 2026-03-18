'use client';

import { useEffect, useState } from 'react';

interface BillingData {
  user: {
    name: string;
    company: string;
    email: string;
    status: string;
    payment: string;
    plan: string;
    joined: string;
  };
  payments: {
    id: string;
    date: string;
    amount: number;
    status: string;
  }[];
  totalPaid: number;
  nextPaymentDate: string | null;
}

const planPrices: Record<string, number> = {
  Pro: 199,
  Enterprise: 499,
  Trial: 0,
};

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/billing')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page on"><div className="scroll"><p style={{ color: 'var(--muted)' }}>Loading...</p></div></div>;
  if (!data) return <div className="page on"><div className="scroll"><p style={{ color: 'var(--red)' }}>Failed to load billing data</p></div></div>;

  const { user, payments, totalPaid, nextPaymentDate } = data;
  const monthlyPrice = planPrices[user.plan] || 0;
  const isPaid = user.payment === 'paid';
  const isTrial = user.status === 'trial' || user.plan === 'Trial';

  return (
    <div className="page on">
      <div className="scroll">
        {/* KPI Row — using consistent .kpi class */}
        <div className="kpi-row">
          <div className="kpi kpi-h" style={{ '--kc': 'var(--gold)' } as React.CSSProperties}>
            <div className="kpi-ico" style={{ background: 'var(--gold-bg)' }}>
              {isTrial ? '\u23F3' : '\u2705'}
            </div>
            <div>
              <div className="kpi-val">{user.plan}</div>
              <div className="kpi-lbl">Current Plan</div>
            </div>
          </div>

          <div className="kpi kpi-h" style={{ '--kc': isPaid ? 'var(--green)' : isTrial ? 'var(--blue)' : 'var(--red)' } as React.CSSProperties}>
            <div className="kpi-ico" style={{ background: isPaid ? 'var(--green-bg)' : isTrial ? 'var(--blue-bg)' : 'var(--red-bg)' }}>
              {isPaid ? '\uD83D\uDCB0' : isTrial ? '\uD83C\uDD93' : '\u26A0\uFE0F'}
            </div>
            <div>
              <div className="kpi-val">{isPaid ? 'Paid' : isTrial ? 'Trial' : 'Unpaid'}</div>
              <div className="kpi-lbl">Payment Status</div>
            </div>
          </div>

          <div className="kpi kpi-h" style={{ '--kc': 'var(--blue)' } as React.CSSProperties}>
            <div className="kpi-ico" style={{ background: 'var(--blue-bg)' }}>
              {'\uD83D\uDCB3'}
            </div>
            <div>
              <div className="kpi-val">${monthlyPrice}<span style={{ fontSize: '0.85rem', fontWeight: 600 }}>/mo</span></div>
              <div className="kpi-lbl">Monthly Price</div>
            </div>
          </div>

          <div className="kpi kpi-h" style={{ '--kc': 'var(--green)' } as React.CSSProperties}>
            <div className="kpi-ico" style={{ background: 'var(--green-bg)' }}>
              {'\uD83D\uDCCA'}
            </div>
            <div>
              <div className="kpi-val">${totalPaid.toLocaleString()}</div>
              <div className="kpi-lbl">Total Paid</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
          {/* Payment History */}
          <div className="scard">
            <div className="scard-head">
              <h3>Payment History</h3>
            </div>

            {payments.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8, opacity: 0.3 }}>{'\uD83D\uDCB3'}</div>
                {isTrial ? 'No payments yet — you\'re on a free trial' : 'No payment history'}
              </div>
            ) : (
              <table className="btable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--ink2)' }}>
                        {new Date(p.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td style={{ fontWeight: 700 }}>${p.amount}</td>
                      <td>
                        <span className={p.status === 'paid' ? 't-active' : 't-expired'}>
                          {p.status === 'paid' ? 'Paid' : 'Failed'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-outline btn-xs">Download</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Subscription Details */}
          <div>
            <div className="scard">
              <div className="scard-head">
                <h3>Subscription Details</h3>
              </div>
              <div className="scard-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>Plan</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{user.plan}{isTrial ? ' (14-day free trial)' : ''}</div>
                </div>

                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>Account Status</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: user.status === 'active' ? 'var(--green)' : user.status === 'trial' ? 'var(--blue)' : 'var(--red)' }}>
                    {user.status === 'active' ? 'Active' : user.status === 'trial' ? 'Trial' : 'Suspended'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>Member Since</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    {user.joined ? new Date(user.joined).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                  </div>
                </div>

                {nextPaymentDate && (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>Next Payment</div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {new Date(nextPaymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                )}

                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>Billing Email</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{user.email}</div>
                </div>
              </div>
            </div>

            {/* Upgrade / Actions */}
            {isTrial && (
              <div className="scard" style={{ background: 'var(--gold-bg)', border: '1.5px solid var(--gold-b)', padding: 18 }}>
                <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: '0.95rem', marginBottom: 8, color: 'var(--gold)' }}>
                  {'\u2B50'} Upgrade to Pro
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink2)', marginBottom: 14, lineHeight: 1.5 }}>
                  Get unlimited projects, bid requests, and vendor management for $199/month.
                </p>
                <button
                  className="btn btn-gold"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => alert('Payment integration coming soon!')}
                >
                  Upgrade Now — $199/mo
                </button>
              </div>
            )}

            {!isPaid && !isTrial && (
              <div className="scard" style={{ background: 'var(--red-bg)', border: '1.5px solid var(--red-b)', padding: 18 }}>
                <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: '0.95rem', marginBottom: 8, color: 'var(--red)' }}>
                  {'\u26A0\uFE0F'} Payment Overdue
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink2)', marginBottom: 14, lineHeight: 1.5 }}>
                  Your payment is overdue. Please update your payment method to avoid account suspension.
                </p>
                <button
                  className="btn btn-gold"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => alert('Payment integration coming soon!')}
                >
                  Update Payment Method
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
