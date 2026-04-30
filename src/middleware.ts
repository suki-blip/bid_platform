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
    const teamCookie = request.cookies.get('team-auth')?.value;

    // Allow access with either contractor-auth or team-auth
    if (!cookie && !teamCookie) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (cookie) {
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
    } else if (teamCookie) {
      try {
        const session = JSON.parse(Buffer.from(teamCookie, 'base64').toString());
        if (!session.teamMemberId) {
          const response = NextResponse.redirect(new URL('/login', request.url));
          response.cookies.delete('team-auth');
          return response;
        }
      } catch {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('team-auth');
        return response;
      }
    }
  }

  // Protect fundraising routes: /fundraising/*
  // Accept both manager (contractor-auth) and fundraiser (team-auth) cookies.
  if (pathname.startsWith('/fundraising')) {
    const cookie = request.cookies.get('contractor-auth')?.value;
    const teamCookie = request.cookies.get('team-auth')?.value;

    if (!cookie && !teamCookie) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (cookie) {
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
    } else if (teamCookie) {
      try {
        const session = JSON.parse(Buffer.from(teamCookie, 'base64').toString());
        if (!session.teamMemberId) {
          const response = NextResponse.redirect(new URL('/login', request.url));
          response.cookies.delete('team-auth');
          return response;
        }
      } catch {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('team-auth');
        return response;
      }
    }
  }

  // Protect fundraising API routes: /api/fundraising/*
  if (pathname.startsWith('/api/fundraising/')) {
    const cookie = request.cookies.get('contractor-auth')?.value;
    const teamCookie = request.cookies.get('team-auth')?.value;
    if (!cookie && !teamCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Protect vendor portal pages: /vendor/* (except /vendor-submit and /vendor-login)
  if (pathname.startsWith('/vendor') && !pathname.startsWith('/vendor-submit') && !pathname.startsWith('/vendor-login')) {
    const cookie = request.cookies.get('vendor-auth')?.value;
    if (!cookie) {
      return NextResponse.redirect(new URL('/login?tab=vendor', request.url));
    }
  }

  // Redirect old vendor-login to combined login page (preserve query params)
  if (pathname === '/vendor-login') {
    const url = new URL('/login', request.url);
    url.searchParams.set('tab', 'vendor');
    // Preserve reset token param
    const reset = request.nextUrl.searchParams.get('reset');
    if (reset) url.searchParams.set('reset', reset);
    return NextResponse.redirect(url);
  }

  // Protect vendor API routes: /api/vendor/* (except /api/vendor-auth/*)
  if (pathname.startsWith('/api/vendor/') && !pathname.startsWith('/api/vendor-auth/')) {
    const cookie = request.cookies.get('vendor-auth')?.value;
    if (!cookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Protect team management API routes: /api/team/* (require contractor-auth, not team-auth)
  if (pathname.startsWith('/api/team/') && !pathname.startsWith('/api/team-auth/')) {
    const cookie = request.cookies.get('contractor-auth')?.value;
    if (!cookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin-panel/:path*', '/api/admin/:path*', '/customer/:path*', '/vendor/:path*', '/vendor-login', '/api/vendor/:path*', '/api/team/:path*', '/fundraising/:path*', '/api/fundraising/:path*'],
};
