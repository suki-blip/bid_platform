import { NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(id);

    if (!bid) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const body = await request.json();
    const { vendor_name, prices, pricing_mode, base_price, rules } = body;

    if (!vendor_name || !prices || !Array.isArray(prices)) {
      return NextResponse.json(
        { error: 'Missing required fields: vendor_name, prices' },
        { status: 400 }
      );
    }

    const mode = pricing_mode === 'additive' ? 'additive' : 'combination';

    if (mode === 'additive' && (base_price === undefined || base_price === null)) {
      return NextResponse.json(
        { error: 'base_price is required for additive pricing mode' },
        { status: 400 }
      );
    }

    const responseId = crypto.randomUUID();

    const insertResponse = db.prepare(
      'INSERT INTO vendor_responses (id, bid_id, vendor_name, pricing_mode, base_price, rules) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const insertPrice = db.prepare(
      'INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      const rulesJson = mode === 'additive' && rules ? JSON.stringify(rules) : null;
      insertResponse.run(responseId, id, vendor_name, mode, mode === 'additive' ? base_price : null, rulesJson);

      for (const priceEntry of prices) {
        const priceId = crypto.randomUUID();
        insertPrice.run(
          priceId,
          responseId,
          priceEntry.combination_key,
          priceEntry.price
        );
      }
    });

    transaction();

    const createdResponse = db
      .prepare('SELECT * FROM vendor_responses WHERE id = ?')
      .get(responseId) as any;

    const createdPrices = db
      .prepare('SELECT * FROM vendor_prices WHERE response_id = ?')
      .all(responseId) as any[];

    return NextResponse.json(
      { ...createdResponse, prices: createdPrices },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating vendor response:', error);
    return NextResponse.json(
      { error: 'Failed to create vendor response' },
      { status: 500 }
    );
  }
}
