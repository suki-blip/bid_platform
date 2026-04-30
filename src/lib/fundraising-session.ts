import { getContractorSession, getTeamSession } from './session';

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

export async function getFundraisingSession(): Promise<FundraisingSession | null> {
  const contractor = await getContractorSession();
  if (contractor) {
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
