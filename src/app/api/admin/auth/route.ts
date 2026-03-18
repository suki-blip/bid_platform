import { NextRequest, NextResponse } from 'next/server';

// Sets admin-auth cookie when the admin panel loads with a valid key path.
// Also works when already authenticated via login (cookie already set).
export async function POST(request: NextRequest) {
  const { key } = await request.json();

  // Check if already authenticated via login
  const existingCookie = request.cookies.get('admin-auth')?.value;
  if (existingCookie && existingCookie.startsWith('bidmaster-admin-')) {
    return NextResponse.json({ ok: true });
  }

  // Validate via secret path
  const pathSecret = process.env.ADMIN_SECRET_PATH;
  if (pathSecret && key === pathSecret) {
    // Set cookie using the same prefix pattern
    const sessionToken = 'bidmaster-admin-' + crypto.randomUUID();
    const response = NextResponse.json({ ok: true });
    response.cookies.set('admin-auth', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return response;
  }

  // If no path secret is configured but we have key='admin' (default), allow it
  if (!pathSecret && key === 'admin') {
    const sessionToken = 'bidmaster-admin-' + crypto.randomUUID();
    const response = NextResponse.json({ ok: true });
    response.cookies.set('admin-auth', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return response;
  }

  return NextResponse.json({ error: 'Invalid' }, { status: 403 });
}
