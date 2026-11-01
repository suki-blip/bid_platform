import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Host-based routing for the fundraising product.
//
// easyfundraisings.com + yeshivatc.com visitors land at the root but we want them to see
// the /fundraising app without the URL changing. The middleware does two things:
//
//   1. Gates auth: anything unknown without a contractor-auth or team-auth cookie
//      bounces to /login.
//   2. Rewrites paths: `/` → `/fundraising`, `/foo` → `/fundraising/foo`, except for a
//      short passthrough list (API, static assets, dialer, auth pages).
//
// Everything else — localhost dev, direct Vercel URLs, custom staging hosts — behaves
// normally and shows the root landing (src/app/page.tsx) which links to /fundraising
// and /dialer.
//
// All BidMaster routing (vendor-login redirects, /customer, /api/vendor/*, /api/team/*,
// /admin-panel protection) was removed on 2026-11-01 along with the UI it protected.

const FUNDRAISING_HOSTS = new Set([
  'easyfundraisings.com',
  'www.easyfundraisings.com',
  'yeshivatc.com',
  'www.yeshivatc.com',
]);

// Paths that stay as-is even on the fundraising-domain (auth pages, system, assets, PWA).
const PASSTHROUGH_PREFIXES = [
  '/api',
  '/_next',
  '/fundraising',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/dialer',
  '/favicon',
  '/sw.js',
  '/manifest.webmanifest',
  '/icon-',
  '/apple-touch-icon',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host')?.toLowerCase() || '';

  // Fundraising domain: gate auth before the rewrite, so unauthenticated visits go to /login.
  if (FUNDRAISING_HOSTS.has(host)) {
    const isPassthrough = PASSTHROUGH_PREFIXES.some((p) =>
      pathname === p ||
      pathname.startsWith(p + '/') ||
      (p.endsWith('-') && pathname.startsWith(p)) ||
      pathname === '/sw.js' ||
      pathname === '/manifest.webmanifest' ||
      pathname === '/apple-touch-icon.png',
    );
    if (!isPassthrough) {
      const cookie = request.cookies.get('contractor-auth')?.value;
      const teamCookie = request.cookies.get('team-auth')?.value;
      if (!cookie && !teamCookie) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      const url = request.nextUrl.clone();
      url.pathname = pathname === '/' ? '/fundraising' : `/fundraising${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/fundraising/:path*',
    '/api/fundraising/:path*',
    // Catch root + arbitrary paths so the host-based fundraising rewrite can fire.
    // Excludes _next, favicon, and API routes that don't need host rewrites.
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
