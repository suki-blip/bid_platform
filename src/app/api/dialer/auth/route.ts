// POST /api/dialer/auth  — verify the dialer passcode and set the session cookie.
// GET  /api/dialer/auth  — report whether configured / already authed (for the gate UI).

import { NextResponse } from 'next/server';
import { dialerConfigured, verifyPasscode, isDialerAuthed, dialerCookieName } from '@/lib/dialer-auth';

export async function GET() {
  return NextResponse.json({ configured: dialerConfigured(), authed: await isDialerAuthed() });
}

export async function POST(request: Request) {
  if (!dialerConfigured()) {
    return NextResponse.json({ error: 'Dialer passcode is not set on the server' }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  if (!verifyPasscode(String(body.passcode || ''))) {
    return NextResponse.json({ error: 'Wrong code' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(dialerCookieName(), String(body.passcode), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
