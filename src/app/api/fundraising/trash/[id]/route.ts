// DELETE /api/fundraising/trash/[id]
//
// "Delete forever" — purges a single recycle-bin entry on demand. Used when the user
// explicitly wants the record gone before the 30-day clock runs out. Manager-only:
// permanent deletes should not be reversible by a fundraiser who didn't trigger them.

import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { purgeFromBin } from '@/lib/fundraising-recycle-bin';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();
  const { id } = await params;

  await purgeFromBin(id, session.ownerId);
  return NextResponse.json({ ok: true });
}
