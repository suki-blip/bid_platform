import { NextResponse } from 'next/server';
import { VENDOR_COOKIE } from '@/lib/vendor-auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(VENDOR_COOKIE, '', {
    path: '/',
    httpOnly: true,
    maxAge: 0,
  });
  return response;
}
