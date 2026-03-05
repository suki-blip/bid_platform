import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(id) as any;

    if (!bid) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const parameters = db
      .prepare('SELECT * FROM bid_parameters WHERE bid_id = ?')
      .all(id) as any[];

    const parametersWithOptions = parameters.map((param) => {
      const options = db
        .prepare('SELECT value FROM bid_parameter_options WHERE parameter_id = ? ORDER BY sort_order')
        .all(param.id) as any[];
      return { name: param.name, options: options.map((o: any) => o.value) };
    });

    const files = db
      .prepare('SELECT id, filename FROM bid_files WHERE bid_id = ?')
      .all(id) as any[];

    const vendorResponses = db
      .prepare('SELECT * FROM vendor_responses WHERE bid_id = ?')
      .all(id) as any[];

    const responsesWithPrices = vendorResponses.map((response) => {
      const prices = db
        .prepare('SELECT * FROM vendor_prices WHERE response_id = ?')
        .all(response.id) as any[];
      return {
        ...response,
        rules: response.rules ? JSON.parse(response.rules) : [],
        prices,
      };
    });

    return NextResponse.json({
      ...bid,
      parameters: parametersWithOptions,
      files,
      vendor_responses: responsesWithPrices,
    });
  } catch (error) {
    console.error('Error fetching bid:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bid' },
      { status: 500 }
    );
  }
}
