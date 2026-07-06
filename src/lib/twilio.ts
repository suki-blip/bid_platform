// Twilio REST client (fetch-based, no SDK) for the autonomous dialer.
//
// Required env vars:
//   TWILIO_ACCOUNT_SID   — starts with "AC..."
//   TWILIO_AUTH_TOKEN    — secret
//   TWILIO_FROM_NUMBER   — your verified caller ID in E.164, e.g. +17186895546
//
// Production flow (no human): Twilio dials the target directly, presents TWILIO_FROM_NUMBER
// as caller ID, and on answer plays the configured DTMF step sequence, then hangs up.

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

export function twilioConfigured(): boolean {
  return Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);
}

export function twilioFromNumber(): string | undefined {
  return FROM_NUMBER;
}

// A single IVR step: wait `waitSeconds` after the previous action, then key `digits`.
export interface DialStep {
  waitSeconds: number;
  digits: string;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeDigits(d: string): string {
  // Valid DTMF for <Play digits>: 0-9, *, #, w (0.5s pause).
  return (d || '').replace(/[^0-9*#w]/gi, '');
}

// Build the TwiML the target hears after answering: pause, key digits, pause, key digits…
export function stepsTwiml(steps: DialStep[]): string {
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>'];
  for (const step of steps) {
    const wait = Math.max(0, Math.min(60, Math.round(step.waitSeconds || 0)));
    if (wait > 0) parts.push(`<Pause length="${wait}"/>`);
    const digits = sanitizeDigits(step.digits);
    if (digits) parts.push(`<Play digits="${digits}"/>`);
  }
  // Keep the line open briefly so the final tone registers, then Twilio hangs up.
  parts.push('<Pause length="2"/>');
  parts.push('</Response>');
  return parts.join('');
}

// Encode steps into a single DTMF string with `w` (0.5s) pauses — used for <Number sendDigits>
// in the "ring me to listen" test mode, where Twilio auto-keys while you listen.
export function stepsToSendDigits(steps: DialStep[]): string {
  let out = '';
  for (const step of steps) {
    const wait = Math.max(0, Math.min(60, Math.round(step.waitSeconds || 0)));
    out += 'w'.repeat(wait * 2); // each w ≈ 0.5s
    out += sanitizeDigits(step.digits);
  }
  return out;
}

// TwiML for the listen/test mode: ring you, then bridge to the target presenting your
// caller ID, auto-keying the digits so you can hear the result live.
export function listenTwiml(target: string, steps: DialStep[]): string {
  const sendDigits = stepsToSendDigits(steps);
  const attr = sendDigits ? ` sendDigits="${sendDigits}"` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Response><Dial callerId="${xmlEscape(FROM_NUMBER || '')}" timeout="30">` +
    `<Number${attr}>${xmlEscape(target)}</Number></Dial></Response>`
  );
}

interface PlaceCallOptions {
  to: string;              // who Twilio dials (the target, or your phone in listen mode)
  twiml: string;           // inline TwiML instructions (no public webhook needed)
  statusCallback?: string; // optional public URL for the final call status
  record?: boolean;        // record the whole call so it can be played back later
}

interface PlaceCallResult {
  success: boolean;
  sid?: string;
  status?: string;
  error?: string;
}

export async function placeCall({ to, twiml, statusCallback, record }: PlaceCallOptions): Promise<PlaceCallResult> {
  if (!twilioConfigured()) {
    return { success: false, error: 'Twilio not configured (set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)' };
  }

  const body = new URLSearchParams({ To: to, From: FROM_NUMBER!, Twiml: twiml });
  if (record) body.set('Record', 'true');
  if (statusCallback) {
    body.set('StatusCallback', statusCallback);
    body.append('StatusCallbackEvent', 'completed');
    body.set('StatusCallbackMethod', 'POST');
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.message || `HTTP ${res.status}` };
    return { success: true, sid: data.sid, status: data.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// Fetch the newest recording's audio for a given Call SID (returns MP3 bytes). Twilio media
// URLs need Basic Auth, so we fetch server-side and stream the bytes to the browser.
export async function fetchCallRecording(callSid: string): Promise<
  { ok: true; body: ArrayBuffer; contentType: string } | { ok: false; error: string; status: number }
> {
  if (!twilioConfigured()) return { ok: false, error: 'Twilio not configured', status: 400 };
  const auth = 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
  try {
    const listRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${callSid}/Recordings.json`,
      { headers: { Authorization: auth } }
    );
    const data = await listRes.json().catch(() => ({}));
    if (!listRes.ok) return { ok: false, error: data.message || `HTTP ${listRes.status}`, status: 502 };
    const recs = data.recordings || [];
    if (!recs.length) return { ok: false, error: 'No recording available yet', status: 404 };

    const mediaRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings/${recs[0].sid}.mp3`,
      { headers: { Authorization: auth } }
    );
    if (!mediaRes.ok) return { ok: false, error: `HTTP ${mediaRes.status}`, status: 502 };
    return { ok: true, body: await mediaRes.arrayBuffer(), contentType: 'audio/mpeg' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 500 };
  }
}
