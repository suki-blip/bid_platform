import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await dbReady();
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const result = await db().execute({
      sql: `SELECT * FROM team_members WHERE email = ? AND status = 'active'`,
      args: [email.toLowerCase().trim()],
    });

    const member = result.rows[0] as Record<string, unknown> | undefined;

    if (!member) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const valid = await verifyPassword(password, member.password_hash as string);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Create team-auth cookie
    const sessionData = JSON.stringify({
      teamMemberId: member.id,
      ownerId: member.owner_id,
      email: member.email,
      name: member.name,
      role: member.role,
      can_view_budget: Boolean(member.can_view_budget),
    });
    const encoded = Buffer.from(sessionData).toString('base64');

    const response = NextResponse.json({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      can_view_budget: Boolean(member.can_view_budget),
    });

    response.cookies.set('team-auth', encoded, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Team member login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
