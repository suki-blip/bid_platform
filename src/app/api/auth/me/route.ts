import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const cookie = request.cookies.get('contractor-auth')?.value;
    if (!cookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let session: any;
    try {
      session = JSON.parse(Buffer.from(cookie, 'base64').toString());
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    await dbReady();
    const client = db();
    const result = await client.execute({
      sql: 'SELECT id, name, company, email, status, payment, plan, joined, last_login FROM saas_users WHERE id = ?',
      args: [session.userId],
    });

    if (result.rows.length === 0) {
      const response = NextResponse.json({ error: 'User not found' }, { status: 401 });
      response.cookies.delete('contractor-auth');
      return response;
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({ error: 'Auth check failed' }, { status: 500 });
  }
}
