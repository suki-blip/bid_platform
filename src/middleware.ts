import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin panel pages: /admin-panel/[key]/...
  if (pathname.startsWith('/admin-panel/')) {
    const segments = pathname.split('/');
    const key = segments[2]; // /admin-panel/[key]/...
    const secret = process.env.ADMIN_SECRET_PATH;

    if (!secret || key !== secret) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  // Protect admin API routes: /api/admin/...
  if (pathname.startsWith('/api/admin/')) {
    // Allow the auth endpoint through — it validates the path key itself
    if (pathname === '/api/admin/auth') {
      return NextResponse.next();
    }

    const secret = process.env.ADMIN_API_SECRET;
    const header = request.headers.get('x-admin-secret');

    // Also allow cookie-based auth (set when accessing admin panel)
    const cookie = request.cookies.get('admin-auth')?.value;

    if (!secret || (header !== secret && cookie !== secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin-panel/:path*', '/api/admin/:path*'],
};
