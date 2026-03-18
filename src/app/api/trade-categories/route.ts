import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  try {
    await dbReady();

    const result = await db().execute({
      sql: 'SELECT * FROM trade_categories ORDER BY grp, name',
      args: [],
    });

    // Also fetch vendors grouped by category
    const vendors = await db().execute({
      sql: `SELECT id, name, email, trade_category FROM vendors WHERE status = 'active' ORDER BY name`,
      args: [],
    });

    // Build a map of category_id -> vendors
    const vendorsByCategory: Record<string, { id: string; name: string; email: string }[]> = {};
    for (const v of vendors.rows) {
      const catId = v.trade_category as string;
      if (!catId) continue;
      if (!vendorsByCategory[catId]) vendorsByCategory[catId] = [];
      vendorsByCategory[catId].push({ id: v.id as string, name: v.name as string, email: v.email as string });
    }

    const categories = result.rows.map(r => ({
      ...r,
      vendors: vendorsByCategory[r.id as string] || [],
    }));

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error fetching trade categories:', error);
    return NextResponse.json({ error: 'Failed to fetch trade categories' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbReady();

    const body = await request.json();
    const { name, grp } = body;

    if (!name) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await db().execute({
      sql: 'INSERT INTO trade_categories (id, name, grp, is_custom) VALUES (?, ?, ?, 1)',
      args: [id, name, grp || 'Other'],
    });

    const result = await db().execute({ sql: 'SELECT * FROM trade_categories WHERE id = ?', args: [id] });
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 });
    }
    console.error('Error creating trade category:', error);
    return NextResponse.json({ error: 'Failed to create trade category' }, { status: 500 });
  }
}
