// Helpers for building outbound URLs to credit-card hosted payment gateways.
//
// We support two configurations:
//   1. CUSTOM TEMPLATE — the configured URL contains {placeholders} like {amount}/{ref}/
//      {return_url}/{donor_name}/{donor_email}/{description}. We substitute them.
//   2. SOLA / CARDKNOX PAYMENTSITE — the configured URL is the merchant's PaymentSITE
//      base (e.g. `https://secure.cardknox.com/yourmerchantpage`). We auto-append the
//      Sola-specific query parameters: xamount, xinvoice, xRedirectURL, xRedirectURL_NotApproved,
//      xCustom01 (our token, mirrored), xBillFirstName, xEmail, xDescription.
//
// Detection: a URL is Sola/Cardknox iff its host is `secure.cardknox.com` (or any
// `*.cardknox.com` / `*.solapayments.com` domain) AND it does NOT contain any
// `{placeholder}` substring. Otherwise we treat it as a custom template.
//
// Why this matters: the user's setting page in Settings just asks for "Gateway URL".
// If they paste their PaymentSITE base, the integration "just works" without making
// them craft a template by hand. If they have a custom gateway, they keep using
// placeholders.

export type GatewayKind = 'sola' | 'template' | 'none';

const SOLA_HOST_SUFFIXES = ['.cardknox.com', '.solapayments.com'];

export function detectGatewayKind(rawUrl: string | null | undefined): GatewayKind {
  if (!rawUrl) return 'none';
  const url = rawUrl.trim();
  if (!url) return 'none';

  // If it contains a {placeholder}, the user picked the custom-template path.
  if (/\{[a-z_]+\}/i.test(url)) return 'template';

  // Otherwise sniff the host.
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    for (const suffix of SOLA_HOST_SUFFIXES) {
      if (host === suffix.slice(1) || host.endsWith(suffix)) return 'sola';
    }
  } catch {
    return 'none';
  }
  // Unknown gateway with no placeholders — fall through to custom template
  // (a no-placeholder template just produces the bare URL with no substitution).
  return 'template';
}

export interface BuildArgs {
  amount: number;
  ref: string;
  donorName: string;
  donorEmail: string;
  description: string;
  returnUrl: string;
}

/**
 * Build a Sola/Cardknox PaymentSITE URL by appending the standard parameters.
 * Existing query params on the base URL are preserved.
 */
export function buildSolaUrl(base: string, vars: BuildArgs): string {
  // Append params using URL so existing ones survive.
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    // If parsing fails, build manually with a `?` separator.
    const sep = base.includes('?') ? '&' : '?';
    const qs = new URLSearchParams();
    setSolaParams(qs, vars);
    return `${base}${sep}${qs.toString()}`;
  }
  setSolaParams(u.searchParams, vars);
  return u.toString();
}

function setSolaParams(qs: URLSearchParams, vars: BuildArgs): void {
  qs.set('xamount', vars.amount.toFixed(2));
  // xinvoice is what the customer sees as a reference; also our session token so we
  // can correlate when the redirect comes back. We mirror into xCustom01 for safety
  // (xinvoice is sometimes user-editable in the form depending on PaymentSITE setup).
  qs.set('xinvoice', vars.ref);
  qs.set('xCustom01', vars.ref);
  if (vars.description) qs.set('xDescription', vars.description);
  if (vars.donorEmail) qs.set('xEmail', vars.donorEmail);
  if (vars.donorName) {
    const parts = vars.donorName.split(/\s+/);
    qs.set('xBillFirstName', parts[0] || vars.donorName);
    if (parts.length > 1) qs.set('xBillLastName', parts.slice(1).join(' '));
  }
  // Sola/Cardknox redirects the browser to xRedirectURL on approval. We preserve
  // our token+secret in that URL so the webhook can find the session.
  qs.set('xRedirectURL', vars.returnUrl);
  qs.set('xRedirectURL_NotApproved', vars.returnUrl);
  // Server-side postback. Requires Cardknox support to enable webhooks for the
  // merchant, but harmless to include — they just ignore it if not enabled.
  qs.set('xPostUrl', vars.returnUrl);
}

/**
 * Substitute {placeholders} in a custom template URL.
 */
export function buildTemplateUrl(template: string, vars: BuildArgs): string {
  return template
    .replace(/\{amount\}/g, vars.amount.toFixed(2))
    .replace(/\{ref\}/g, encodeURIComponent(vars.ref))
    .replace(/\{donor_name\}/g, encodeURIComponent(vars.donorName))
    .replace(/\{donor_email\}/g, encodeURIComponent(vars.donorEmail))
    .replace(/\{description\}/g, encodeURIComponent(vars.description))
    .replace(/\{return_url\}/g, encodeURIComponent(vars.returnUrl));
}

/**
 * Top-level: build the outbound URL for whatever provider the owner has configured.
 * Returns null when the owner hasn't set up any gateway.
 */
export function buildGatewayUrl(rawUrl: string | null | undefined, vars: BuildArgs): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const kind = detectGatewayKind(rawUrl);
  if (kind === 'sola') return buildSolaUrl(rawUrl.trim(), vars);
  if (kind === 'template') return buildTemplateUrl(rawUrl.trim(), vars);
  return null;
}
