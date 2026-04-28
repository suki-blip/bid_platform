'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface BillingData {
  user: {
    name: string;
    company: string;
    email: string;
    status: string;
    payment: string;
    plan: string;
    joined: string;
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
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

export default function BillingPageWrapper() {
  return (
    <Suspense fallback={<div className="page on"><div className="scroll"><p style={{ color: 'var(--muted)' }}>Loading...</p></div></div>}>
      <BillingPage />
    </Suspense>
  );
}

function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const searchParams = useSearchParams();
  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');

  useEffect(() => {
    fetch('/api/billing')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe() {
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to start checkout');
      }
    } catch {
      alert('Failed to connect to payment system');
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to open billing portal');
      }
    } catch {
      alert('Failed to connect to payment system');
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) return <div className="page on"><div className="scroll"><p style={{ color: 'var(--muted)' }}>Loading...</p></div></div>;
  if (!data) return <div className="page on"><div className="scroll"><p style={{ color: 'var(--red)' }}>Failed to load billing data</p></div></div>;

  const { user, payments, totalPaid, nextPaymentDate } = data;
  const isPaid = user.payment === 'paid';
  const isPro = user.plan === 'Pro' && isPaid;
  const hasStripe = !!user.stripe_subscription_id;

  return (
    <div className="page on">
      <div className="scroll">
        {/* Success/Cancel banners */}
        {success && (
          <div style={{
            background: 'var(--green-bg)', border: '1.5px solid var(--green-b)', borderRadius: 10,
            padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: '1.2rem' }}>&#10003;</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--green)' }}>Payment Successful!</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ink2)' }}>Your Pro subscription is now active. Thank you!</div>
            </div>
          </div>
        )}
        {canceled && (
          <div style={{
            background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 10,
            padding: '14px 18px', marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#92400e' }}>Checkout canceled</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ink2)' }}>No charges were made. You can subscribe anytime.</div>
          </div>
        )}

        {/* KPI Row */}
        <div className="kpi-row">
          <div className="kpi kpi-h" style={{ '--kc': 'var(--gold)' } as React.CSSProperties}>
            <div className="kpi-ico" style={{ background: 'var(--gold-bg)' }}>
              {isPro ? '\u2705' : '\u23F3'}
            </div>
            <div>
              <div className="kpi-val">{user.plan}</div>
              <div className="kpi-lbl">Current Plan</div>
            </div>
          </div>

          <div className="kpi kpi-h" style={{ '--kc': isPaid ? 'var(--green)' : 'var(--red)' } as React.CSSProperties}>
            <div className="kpi-ico" style={{ background: isPaid ? 'var(--green-bg)' : 'var(--red-bg)' }}>
              {isPaid ? '\uD83D\uDCB0' : '\u26A0\uFE0F'}
            </div>
            <div>
              <div className="kpi-val">{isPaid ? 'Paid' : 'Unpaid'}</div>
              <div className="kpi-lbl">Payment Status</div>
            </div>
          </div>

          <div className="kpi kpi-h" style={{ '--kc': 'var(--blue)' } as React.CSSProperties}>
            <div className="kpi-ico" style={{ background: 'var(--blue-bg)' }}>
              {'\uD83D\uDCB3'}
            </div>
            <div>
              <div className="kpi-val">{isPro ? '$199' : '$0'}<span style={{ fontSize: '0.85rem', fontWeight: 600 }}>/mo</span></div>
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
                No payments yet
              </div>
            ) : (
              <table className="btable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
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
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    {isPro ? 'Professional — $199/mo' : 'No active subscription'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 600 }}>Account Status</div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: user.status === 'active' ? 'var(--green)' : 'var(--red)' }}>
                    {user.status === 'active' ? 'Active' : user.status === 'trial' ? 'Trial' : user.status === 'pending' ? 'Pending Activation' : 'Suspended'}
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

            {/* Subscribe button for non-paying users */}
            {!isPro && (
              <div className="scard" style={{ background: 'var(--gold-bg)', border: '1.5px solid var(--gold-b)', padding: 18, marginTop: 14 }}>
                <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: '0.95rem', marginBottom: 8, color: 'var(--gold)' }}>
                  Subscribe to Pro
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink2)', marginBottom: 14, lineHeight: 1.5 }}>
                  Get unlimited projects, AI document scanning, bid comparison, and vendor management for $199/month.
                </p>
                <button
                  className="btn btn-gold"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleSubscribe}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? 'Redirecting to Stripe...' : 'Subscribe Now — $199/mo'}
                </button>
              </div>
            )}

            {/* Manage billing for paying users */}
            {isPro && hasStripe && (
              <div className="scard" style={{ padding: 18, marginTop: 14 }}>
                <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: '0.95rem', marginBottom: 8 }}>
                  Manage Subscription
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink2)', marginBottom: 14, lineHeight: 1.5 }}>
                  Update payment method, view invoices, or cancel your subscription.
                </p>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                >
                  {portalLoading ? 'Opening...' : 'Manage Billing via Stripe'}
                </button>
              </div>
            )}

            {/* Payment overdue */}
            {user.payment === 'overdue' && (
              <div className="scard" style={{ background: 'var(--red-bg)', border: '1.5px solid var(--red-b)', padding: 18, marginTop: 14 }}>
                <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: '0.95rem', marginBottom: 8, color: 'var(--red)' }}>
                  Payment Overdue
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink2)', marginBottom: 14, lineHeight: 1.5 }}>
                  Your last payment failed. Please update your payment method to avoid account suspension.
                </p>
                <button
                  className="btn btn-gold"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                >
                  {portalLoading ? 'Opening...' : 'Update Payment Method'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
