// Always shows cents — even on round amounts (so $100 reads as "$100.00", $1,234.56 stays
// "$1,234.56"). Accuracy beats prettiness here: the user wants to see the exact figure they
// charged or received, including the change.
export function fmtMoney(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtMonth(yyyymm: string): string {
  return new Date(yyyymm + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// Re-export the canonical label resolver so older call sites keep working.
import { paymentMethodLabel } from './fundraising-types';
export function fmtMethod(m: string | null | undefined): string {
  return paymentMethodLabel(m);
}

export function daysOverdue(iso: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}
