import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getContractorSession } from '@/lib/session';

export async function PATCH(request: NextRequest) {
  try {
    await dbReady();
    const client = db();
    const session = await getContractorSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, company } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    await client.execute({
      sql: 'UPDATE saas_users SET name = ?, company = ? WHERE id = ?',
      args: [name.trim(), company?.trim() || '', session.userId],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
