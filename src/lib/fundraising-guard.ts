import { db } from './db';
import { FundraisingSession } from './fundraising-session';

export async function ensureDonorAccess(
  donorId: string,
  session: FundraisingSession,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const sql =
    session.role === 'fundraiser'
      ? 'SELECT id FROM fr_donors WHERE id = ? AND owner_id = ? AND assigned_to = ?'
      : 'SELECT id FROM fr_donors WHERE id = ? AND owner_id = ?';
  const args =
    session.role === 'fundraiser' ? [donorId, session.ownerId, session.fundraiserId!] : [donorId, session.ownerId];
  const r = await db().execute({ sql, args });
  if (!r.rows[0]) return { ok: false, status: 404, error: 'Donor not found' };
  return { ok: true };
}
