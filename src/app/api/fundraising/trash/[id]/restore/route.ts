// POST /api/fundraising/trash/[id]/restore
//
// Pulls the JSON snapshot out of fr_recycle_bin, INSERT OR REPLACEs every row back into the
// live tables, recomputes totals, and removes the recycle-bin entry. Returns the restored
// entity's ID + type so the UI can redirect.

import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { restoreFromBin } from '@/lib/fundraising-recycle-bin';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await dbReady();
  const { id } = await params;

  const result = await restoreFromBin(id, session.ownerId);
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : 500;
    return NextResponse.json({ error: result.error || 'Could not restore' }, { status });
  }
  return NextResponse.json({ ok: true, type: result.type, entity_id: result.entity_id });
}
