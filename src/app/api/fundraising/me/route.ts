import { NextResponse } from 'next/server';
import { getFundraisingSession } from '@/lib/fundraising-session';

export async function GET() {
  const session = await getFundraisingSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    role: session.role,
    name: session.name,
    email: session.email,
    fundraiserId: session.fundraiserId,
    isManager: session.isManager,
  });
}
