import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Fixed admin token prefix — the login API sets a cookie starting with this
const ADMIN_COOKIE_PREFIX = 'bidmaster-admin-';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin panel pages: /admin-panel/[key]/...
  if (pathname.startsWith('/admin-panel/')) {
    const segments = pathname.split('/');
    const key = segments[2]; // /admin-panel/[key]/...
    const secret = process.env.ADMIN_SECRET_PATH;

    // Allow access via secret path OR valid admin-auth cookie
    const adminCookie = request.cookies.get('admin-auth')?.value;

    const pathValid = secret && key === secret;
    const cookieValid = adminCookie && adminCookie.startsWith(ADMIN_COOKIE_PREFIX);

    if (!pathValid && !cookieValid) {
      return NextResponse.redirect(new URL('/admin-login', request.url));
    }
  }

  // Protect admin API routes: /api/admin/...
  if (pathname.startsWith('/api/admin/')) {
    // Allow auth and login endpoints through
    if (pathname === '/api/admin/auth' || pathname === '/api/admin/login') {
      return NextResponse.next();
    }

    const adminCookie = request.cookies.get('admin-auth')?.value;
    const secret = process.env.ADMIN_API_SECRET;
    const header = request.headers.get('x-admin-secret');

    const cookieValid = adminCookie && (
      adminCookie.startsWith(ADMIN_COOKIE_PREFIX) ||
      (secret && adminCookie === secret)
    );
    const headerValid = secret && header === secret;

    if (!cookieValid && !headerValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Protect contractor (customer) routes: /customer/*
  if (pathname.startsWith('/customer')) {
    const cookie = request.cookies.get('contractor-auth')?.value;
    if (!cookie) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    try {
      const session = JSON.parse(Buffer.from(cookie, 'base64').toString());
      if (!session.userId) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('contractor-auth');
        return response;
      }
    } catch {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('contractor-auth');
      return response;
    }
  }

  // Protect vendor portal pages: /vendor/* (except /vendor-submit and /vendor-login)
  if (pathname.startsWith('/vendor') && !pathname.startsWith('/vendor-submit') && !pathname.startsWith('/vendor-login')) {
    const cookie = request.cookies.get('vendor-auth')?.value;
    if (!cookie) {
      return NextResponse.redirect(new URL('/vendor-login', request.url));
    }
  }

  // Protect vendor API routes: /api/vendor/* (except /api/vendor-auth/*)
  if (pathname.startsWith('/api/vendor/') && !pathname.startsWith('/api/vendor-auth/')) {
    const cookie = request.cookies.get('vendor-auth')?.value;
    if (!cookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin-panel/:path*', '/api/admin/:path*', '/customer/:path*', '/vendor/:path*', '/api/vendor/:path*'],
};
