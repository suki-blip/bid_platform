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
    const userId = authSession.userId;

    const userResult = await db().execute({ sql: 'SELECT * FROM saas_users WHERE id = ?', args: [userId] });
    const user = userResult.rows[0];
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let stripeCustomerId = user.stripe_customer_id as string | null;

    // Create Stripe customer if needed
    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: user.email as string,
        name: user.name as string,
        metadata: { user_id: userId },
      });
      stripeCustomerId = customer.id;
      await db().execute({ sql: 'UPDATE saas_users SET stripe_customer_id = ? WHERE id = ?', args: [stripeCustomerId, userId] });
    }

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID!,
        quantity: 1,
      }],
      success_url: 'https://www.bidmaster.app/customer/billing?success=1',
      cancel_url: 'https://www.bidmaster.app/customer/billing?canceled=1',
      subscription_data: {
        metadata: { user_id: userId },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error('Stripe checkout error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Checkout failed: ${msg}` }, { status: 500 });
  }
}
