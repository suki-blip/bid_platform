import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db, dbReady } from '@/lib/db';
import { getContractorSession } from '@/lib/session';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST() {
  try {
    await dbReady();

    const authSession = await getContractorSession();
    if (!authSession) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const userResult = await db().execute({ sql: 'SELECT stripe_customer_id FROM saas_users WHERE id = ?', args: [authSession.userId] });
    const user = userResult.rows[0];
    if (!user || !user.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripe_customer_id as string,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.bidmaster.app'}/customer/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
