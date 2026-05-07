import { getContractorSession, getTeamSession } from './session';
import { db, dbReady } from './db';

export type FundraisingRole = 'manager' | 'fundraiser';

export interface FundraisingSession {
  role: FundraisingRole;
  ownerId: string;
  actorId: string;
  fundraiserId: string | null;
  email: string;
  name: string;
  isManager: boolean;
}

// Check the live DB status for the owner. If pending/suspended/trial-expired, block the session.
// This means an admin's "Suspend" action takes effect on the very next API request, not the next login.
async function ownerIsActive(ownerId: string): Promise<boolean> {
  try {
    await dbReady();
    const r = await db().execute({
      sql: 'SELECT status, trial_end_date FROM saas_users WHERE id = ?',
      args: [ownerId],
    });
    if (r.rows.length === 0) return false;
    const status = String(r.rows[0].status || '');
    const trialEnd = r.rows[0].trial_end_date ? String(r.rows[0].trial_end_date) : null;

    if (status === 'active') return true;
    if (status === 'trial') {
      if (!trialEnd) return true;
      return new Date(trialEnd).getTime() >= Date.now();
    }
    // 'pending', 'suspended', anything else → blocked
    return false;
  } catch {
    // Fail closed if DB is unreachable.
    return false;
  }
}

export async function getFundraisingSession(): Promise<FundraisingSession | null> {
  const contractor = await getContractorSession();
  if (contractor) {
    if (!(await ownerIsActive(contractor.userId))) return null;
    return {
      role: 'manager',
      ownerId: contractor.userId,
      actorId: contractor.userId,
      fundraiserId: null,
      email: contractor.email,
      name: contractor.name,
      isManager: true,
    };
  }

  const team = await getTeamSession();
  if (team && team.role === 'fundraiser') {
    // Team members inherit the owner's active status — if the manager's account is pending/suspended,
    // their fundraisers can't access either.
    if (!(await ownerIsActive(team.ownerId))) return null;
    return {
      role: 'fundraiser',
      ownerId: team.ownerId,
      actorId: team.teamMemberId,
      fundraiserId: team.teamMemberId,
      email: team.email,
      name: team.name,
      isManager: false,
    };
  }

  return null;
}
