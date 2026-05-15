import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { softDeleteDonor } from '@/lib/fundraising-recycle-bin';

export async function POST(request: Request) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: 'Too many ids (max 500)' }, { status: 400 });

  // Soft-delete each donor (each gets its own recycle-bin entry). We run them serially
  // rather than in a single SQL DELETE so each donor's sub-tree is captured into its own
  // restore-able snapshot. Bulk-delete of 500 donors takes ~a second or two — fine for a
  // human-triggered action and Vercel's request timeout.
  let deleted = 0;
  const recycleIds: string[] = [];
  for (const id of ids) {
    const result = await softDeleteDonor({
      donorId: id,
      ownerId: session.ownerId,
      deletedBy: session.fundraiserId || null,
    });
    if (result.ok) {
      deleted++;
      if (result.recycle_id) recycleIds.push(result.recycle_id);
    }
  }

  return NextResponse.json({ deleted, recycle_ids: recycleIds });
}
