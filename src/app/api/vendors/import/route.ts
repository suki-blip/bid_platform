import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function POST(request: Request) {
  try {
    await dbReady();

    const body = await request.json();
    const { rows } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    // Build trade lookup
    const tradesResult = await db().execute({ sql: 'SELECT id, name FROM trade_categories', args: [] });
    const tradeLookup = new Map(
      tradesResult.rows.map(t => [(t.name as string).toLowerCase(), t.id as string])
    );

    const results = { created: 0, errors: [] as { row: number; reason: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.name || !row.email) {
        results.errors.push({ row: i + 1, reason: 'Missing name or email' });
        continue;
      }

      // Check duplicate
      const existing = await db().execute({ sql: 'SELECT id FROM vendors WHERE email = ?', args: [row.email] });
      if (existing.rows.length > 0) {
        results.errors.push({ row: i + 1, reason: `Duplicate email: ${row.email}` });
        continue;
      }

      const tradeId = row.trade ? tradeLookup.get(row.trade.toLowerCase()) || null : null;
      const id = crypto.randomUUID();

      await db().execute({
        sql: 'INSERT INTO vendors (id, name, email, phone, trade_category) VALUES (?, ?, ?, ?, ?)',
        args: [id, row.name, row.email, row.phone || null, tradeId],
      });
      results.created++;
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Error importing vendors:', error);
    return NextResponse.json({ error: 'Failed to import vendors' }, { status: 500 });
  }
}
