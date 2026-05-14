// Cardknox / Sola Payments — server-to-server API client.
//
// Two endpoints:
//   POST https://x1.cardknox.com/gatewayjson   — transactions (cc:sale, cc:void, cc:refund, cc:authonly, …)
//   POST https://x1.cardknox.com/reportjson    — reports (Report:Transactions)
//
// Auth is per-request: every body must include `xKey` (the merchant's API key).
// We require xVersion=5.0.0, xSoftwareName, xSoftwareVersion on every call.
//
// All responses use Cardknox's "x-prefixed" field convention. The most important fields:
//   xResult     'A'pproved | 'D'eclined | 'E'rror
//   xStatus     human-readable: "Approved", "Declined", "Error", "Verification", "Voided"
//   xRefNum     Cardknox's transaction reference (stable across the transaction lifecycle)
//   xError      free-text error description (when xResult != A)
//   xErrorCode  numeric error code
//   xMaskedCardNumber, xCardType, xBillFirstName, xBillLastName, xAuthCode, xAvsResult, ...

import { db } from './db';

const TX_ENDPOINT = 'https://x1.cardknox.com/gatewayjson';
const REPORT_ENDPOINT = 'https://x1.cardknox.com/reportjson';

const SOLA_TIMEOUT_MS = 25_000;

export interface SolaCredentials {
  xKey: string;
  softwareName: string;
  softwareVersion: string;
}

export interface SolaResponse {
  xResult: string; // A | D | E
  xStatus: string;
  xRefNum: string | null;
  xError: string | null;
  xErrorCode: string | null;
  xAuthCode: string | null;
  xMaskedCardNumber: string | null;
  xCardType: string | null;
  xBillFirstName: string | null;
  xBillLastName: string | null;
  xAvsResult: string | null;
  xAvsResultCode: string | null;
  xAmount: string | null;
  xInvoice: string | null;
  xToken: string | null;       // Cardknox vault token, returned when xCreateToken=1 was sent
  xExp: string | null;         // MMYY echoed back — handy for storing alongside the token
  raw: Record<string, unknown>;
}

export class SolaError extends Error {
  constructor(message: string, public readonly response?: SolaResponse) {
    super(message);
    this.name = 'SolaError';
  }
}

/**
 * Load Sola credentials for a given owner. Throws SolaError if not configured.
 */
export async function loadSolaCredentials(ownerId: string): Promise<SolaCredentials> {
  const row = await db().execute({
    sql: 'SELECT sola_xkey, sola_software_name FROM saas_users WHERE id = ?',
    args: [ownerId],
  });
  if (row.rows.length === 0) throw new SolaError('Owner not found');
  const xKey = (row.rows[0].sola_xkey as string | null) || '';
  const softwareName = (row.rows[0].sola_software_name as string | null) || 'easyfundraisings';
  if (!xKey) throw new SolaError('Sola API key (xKey) is not configured. Add it in /fundraising/settings.');
  return { xKey, softwareName, softwareVersion: '1.0' };
}

async function postCardknox(url: string, body: Record<string, string>): Promise<SolaResponse> {
  // Cardknox prefers form-urlencoded but accepts JSON on the *json endpoints.
  // We use JSON for cleanliness.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOLA_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SolaError(`Cardknox HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return {
      xResult: String(json.xResult || ''),
      xStatus: String(json.xStatus || ''),
      xRefNum: json.xRefNum ? String(json.xRefNum) : null,
      xError: json.xError ? String(json.xError) : null,
      xErrorCode: json.xErrorCode ? String(json.xErrorCode) : null,
      xAuthCode: json.xAuthCode ? String(json.xAuthCode) : null,
      xMaskedCardNumber: json.xMaskedCardNumber ? String(json.xMaskedCardNumber) : null,
      xCardType: json.xCardType ? String(json.xCardType) : null,
      xBillFirstName: json.xBillFirstName ? String(json.xBillFirstName) : null,
      xBillLastName: json.xBillLastName ? String(json.xBillLastName) : null,
      xAvsResult: json.xAvsResult ? String(json.xAvsResult) : null,
      xAvsResultCode: json.xAvsResultCode ? String(json.xAvsResultCode) : null,
      xAmount: json.xAmount ? String(json.xAmount) : null,
      xInvoice: json.xInvoice ? String(json.xInvoice) : null,
      xToken: json.xToken ? String(json.xToken) : null,
      xExp: json.xExp ? String(json.xExp) : null,
      raw: json,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface SaleArgs {
  amount: number;
  cardNumToken: string; // SUT from iFields
  cvvToken?: string | null; // SUT from iFields
  exp: string; // MMYY
  invoice?: string | null; // our session token
  description?: string | null;
  street?: string | null;
  zip?: string | null;
  billFirstName?: string | null;
  billLastName?: string | null;
  email?: string | null;
  /** When true, ask Cardknox to also return a vault token (xToken) so we can charge this card again later without re-collecting it. */
  createToken?: boolean;
}

/**
 * Run a credit-card sale via Cardknox Transaction API.
 * Uses iFields SUTs for card number + CVV — we never see real card data.
 */
export async function solaSale(creds: SolaCredentials, args: SaleArgs): Promise<SolaResponse> {
  const body: Record<string, string> = {
    xKey: creds.xKey,
    xVersion: '5.0.0',
    xSoftwareName: creds.softwareName,
    xSoftwareVersion: creds.softwareVersion,
    xCommand: 'cc:sale',
    xAmount: args.amount.toFixed(2),
    xCardNum: args.cardNumToken,
    xExp: args.exp,
  };
  if (args.cvvToken) body.xCVV = args.cvvToken;
  if (args.invoice) body.xInvoice = args.invoice;
  if (args.description) body.xDescription = args.description;
  if (args.street) body.xStreet = args.street;
  if (args.zip) body.xZip = args.zip;
  if (args.billFirstName) body.xBillFirstName = args.billFirstName;
  if (args.billLastName) body.xBillLastName = args.billLastName;
  if (args.email) body.xEmail = args.email;
  if (args.createToken) body.xCreateToken = '1';
  // Encourage AVS / CVV checks for fraud protection
  body.xAllowDuplicate = '1'; // donations: same donor can charge the same amount multiple times legitimately

  return postCardknox(TX_ENDPOINT, body);
}

export interface TokenSaleArgs {
  amount: number;
  /** Cardknox vault token (returned from a previous cc:sale with xCreateToken=1). */
  token: string;
  /** Optional MMYY — Cardknox stores the exp with the token, but we send it for accuracy if known. */
  exp?: string | null;
  invoice?: string | null;
  description?: string | null;
  street?: string | null;
  zip?: string | null;
  billFirstName?: string | null;
  billLastName?: string | null;
  email?: string | null;
}

/**
 * Charge a previously-saved card using its Cardknox vault token.
 *
 * Cardknox interprets xCardNum as a token automatically when the value matches the vault
 * format (starts with letters, 22+ chars). No CVV or re-tokenization needed. This is the
 * primary path for:
 *   - the daily auto-charge cron (recurring monthly pledges with a saved card)
 *   - one-click "charge again" from the donor profile
 */
export async function solaTokenSale(creds: SolaCredentials, args: TokenSaleArgs): Promise<SolaResponse> {
  const body: Record<string, string> = {
    xKey: creds.xKey,
    xVersion: '5.0.0',
    xSoftwareName: creds.softwareName,
    xSoftwareVersion: creds.softwareVersion,
    xCommand: 'cc:sale',
    xAmount: args.amount.toFixed(2),
    xCardNum: args.token, // Cardknox detects the vault token automatically
  };
  if (args.exp) body.xExp = args.exp;
  if (args.invoice) body.xInvoice = args.invoice;
  if (args.description) body.xDescription = args.description;
  if (args.street) body.xStreet = args.street;
  if (args.zip) body.xZip = args.zip;
  if (args.billFirstName) body.xBillFirstName = args.billFirstName;
  if (args.billLastName) body.xBillLastName = args.billLastName;
  if (args.email) body.xEmail = args.email;
  body.xAllowDuplicate = '1';

  return postCardknox(TX_ENDPOINT, body);
}

/**
 * Detect the card brand from a masked card number ("1XXXXXXXXX4242" or "VISA-...4242").
 * Cardknox returns xCardType as Visa | MasterCard | Amex | Discover | Other.
 * If xCardType is available, prefer that; otherwise fall back to BIN heuristics.
 */
export function ccBrand(masked: string | null, xCardType: string | null): string | null {
  if (xCardType) return xCardType;
  if (!masked) return null;
  const digits = String(masked).replace(/\D/g, '');
  if (digits.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'MasterCard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^6(011|5)/.test(digits)) return 'Discover';
  return null;
}

/**
 * Parse a Cardknox MMYY exp string into { month, year } (year as full 4-digit).
 */
export function parseExp(mmyy: string | null): { month: number | null; year: number | null } {
  if (!mmyy) return { month: null, year: null };
  const m = mmyy.match(/^(\d{2})(\d{2})$/);
  if (!m) return { month: null, year: null };
  const month = Number(m[1]);
  const yy = Number(m[2]);
  if (month < 1 || month > 12) return { month: null, year: null };
  // Cardknox returns 2-digit year; we expand to 4-digit assuming 21st century.
  return { month, year: 2000 + yy };
}

export interface ReportArgs {
  /** ISO date 'YYYY-MM-DD'. Optional. Default: 30 days ago. */
  fromDate?: string;
  /** ISO date 'YYYY-MM-DD'. Optional. Default: today. */
  toDate?: string;
  /** Filter to a specific reference number. */
  refNum?: string;
  /** Filter to a specific invoice (our session token). */
  invoice?: string;
}

/**
 * Pull a list of recent transactions from Cardknox via Report:Transactions.
 * Returns the raw list — callers are responsible for matching to local records.
 */
export async function solaReportTransactions(
  creds: SolaCredentials,
  args: ReportArgs,
): Promise<{ transactions: Record<string, unknown>[]; raw: Record<string, unknown> }> {
  const body: Record<string, string> = {
    xKey: creds.xKey,
    xVersion: '5.0.0',
    xSoftwareName: creds.softwareName,
    xSoftwareVersion: creds.softwareVersion,
    xCommand: 'Report:Transactions',
  };
  // Default to last 30 days if neither bound supplied
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromStr = (args.fromDate || defaultFrom.toISOString().slice(0, 10)).replace(/-/g, '');
  const toStr = (args.toDate || now.toISOString().slice(0, 10)).replace(/-/g, '');
  // Cardknox accepts xBeginDate / xEndDate in YYYYMMDD format
  body.xBeginDate = fromStr;
  body.xEndDate = toStr;
  if (args.refNum) body.xRefNum = args.refNum;
  if (args.invoice) body.xInvoice = args.invoice;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOLA_TIMEOUT_MS);
  try {
    const res = await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SolaError(`Cardknox HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    // Report responses wrap rows under 'xReportData' (Cardknox convention) as an array of objects
    let transactions: Record<string, unknown>[] = [];
    const data = json.xReportData;
    if (Array.isArray(data)) {
      transactions = data as Record<string, unknown>[];
    } else if (data && typeof data === 'object') {
      transactions = [data as Record<string, unknown>];
    }
    return { transactions, raw: json };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Was the transaction approved?
 */
export function solaApproved(res: SolaResponse): boolean {
  return res.xResult === 'A';
}

/**
 * Pull the last 4 digits out of "1XXXXXXXXX4242" / similar.
 */
export function ccLast4(masked: string | null): string | null {
  if (!masked) return null;
  const m = String(masked).match(/(\d{4})\s*$/);
  return m ? m[1] : null;
}
