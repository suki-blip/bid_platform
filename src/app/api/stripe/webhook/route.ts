import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db, dbReady } from '@/lib/db';
import crypto from 'crypto';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(request: Request) {
  try {
    await dbReady();
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // Find user by stripe_customer_id
        const userResult = await db().execute({ sql: 'SELECT * FROM saas_users WHERE stripe_customer_id = ?', args: [customerId] });
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id as string;
          await db().execute({
            sql: "UPDATE saas_users SET status = 'active', payment = 'paid', plan = 'Pro', stripe_subscription_id = ? WHERE id = ?",
            args: [subscriptionId, userId],
          });
          // Log payment
          await db().execute({
            sql: 'INSERT INTO payments (id, user_id, date, amount, status) VALUES (?, ?, datetime(\'now\'), 199, \'paid\')',
            args: [crypto.randomUUID(), userId],
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const userResult = await db().execute({ sql: 'SELECT * FROM saas_users WHERE stripe_customer_id = ?', args: [customerId] });
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id as string;
          await db().execute({
            sql: "UPDATE saas_users SET status = 'active', payment = 'paid' WHERE id = ?",
            args: [userId],
          });
          // Log payment (skip first invoice — already logged in checkout.session.completed)
          if (invoice.billing_reason !== 'subscription_create') {
            await db().execute({
              sql: 'INSERT INTO payments (id, user_id, date, amount, status) VALUES (?, ?, datetime(\'now\'), ?, \'paid\')',
              args: [crypto.randomUUID(), userId, (invoice.amount_paid || 0) / 100],
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const userResult = await db().execute({ sql: 'SELECT * FROM saas_users WHERE stripe_customer_id = ?', args: [customerId] });
        if (userResult.rows.length > 0) {
          await db().execute({
            sql: "UPDATE saas_users SET payment = 'overdue' WHERE id = ?",
            args: [userResult.rows[0].id as string],
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const userResult = await db().execute({ sql: 'SELECT * FROM saas_users WHERE stripe_customer_id = ?', args: [customerId] });
        if (userResult.rows.length > 0) {
          await db().execute({
            sql: "UPDATE saas_users SET status = 'pending', payment = 'canceled', plan = 'Free', stripe_subscription_id = NULL WHERE id = ?",
            args: [userResult.rows[0].id as string],
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
