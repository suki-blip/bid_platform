export const DONOR_STATUSES = ['prospect', 'donor'] as const;
export type DonorStatus = (typeof DONOR_STATUSES)[number];

export const PAYMENT_PLANS = ['lump_sum', 'monthly', 'quarterly', 'annual', 'custom'] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

export const PAYMENT_METHODS = ['credit_card', 'check', 'cash', 'wire', 'ach'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['scheduled', 'paid', 'bounced', 'failed', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PLEDGE_STATUSES = ['open', 'fulfilled', 'cancelled'] as const;
export type PledgeStatus = (typeof PLEDGE_STATUSES)[number];

export const FOLLOWUP_KINDS = ['task', 'call', 'meeting', 'email', 'event'] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];

export const FOLLOWUP_PRIORITIES = ['low', 'normal', 'high'] as const;
export type FollowupPriority = (typeof FOLLOWUP_PRIORITIES)[number];

export const FOLLOWUP_STATUSES = ['pending', 'done', 'skipped'] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const PROJECT_STATUSES = ['active', 'closed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const CALL_DIRECTIONS = ['inbound', 'outbound'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_CHANNELS = ['phone', 'email', 'meeting', 'text', 'event'] as const;
export type CallChannel = (typeof CALL_CHANNELS)[number];

export const PREFERRED_CONTACTS = ['phone', 'email', 'text', 'in_person', 'mail'] as const;
export type PreferredContact = (typeof PREFERRED_CONTACTS)[number];

export const EMAIL_STATUSES = ['scheduled', 'sent', 'delivered', 'bounced', 'failed', 'cancelled'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export function inEnum<T extends readonly string[]>(arr: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (arr as readonly string[]).includes(v);
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function isIsoDate(v: unknown): boolean {
  return typeof v === 'string' && ISO_DATE_RE.test(v);
}

export function isPositiveAmount(v: unknown): v is number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 1e12;
}
