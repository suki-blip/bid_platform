import { cookies } from 'next/headers';

export interface ContractorSession {
  userId: string;
  email: string;
  name: string;
  company: string | null;
  plan: string;
}

export async function getContractorSession(): Promise<ContractorSession | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get('contractor-auth')?.value;
    if (!cookie) return null;
    const session = JSON.parse(Buffer.from(cookie, 'base64').toString());
    if (!session.userId) return null;
    return session as ContractorSession;
  } catch {
    return null;
  }
}
