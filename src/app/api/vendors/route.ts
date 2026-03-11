import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await dbReady();

    const { searchParams } = new URL(request.url);
    const trade = searchParams.get('trade');
    const status = searchParams.get('status');

    let sql = `SELECT v.*, tc.name as trade_name, tc.grp as trade_group
               FROM vendors v
               LEFT JOIN trade_categories tc ON tc.id = v.trade_category
               WHERE 1=1`;
    const args: string[] = [];

    if (status) {
      sql += ' AND v.status = ?';
      args.push(status);
    } else {
      sql += " AND v.status != 'removed'";
    }

    if (trade) {
      sql += ' AND v.trade_category = ?';
      args.push(trade);
    }

    sql += ' ORDER BY v.name ASC';

    const result = await db().execute({ sql, args });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await dbReady();

    const body = await request.json();
    const { name, email, cc_emails, phone, contact_person, trade_category, website, license, notes } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Missing required fields: name, email' }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await db().execute({
      sql: 'INSERT INTO vendors (id, name, email, cc_emails, phone, contact_person, trade_category, website, license, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, name, email, cc_emails || null, phone || null, contact_person || null, trade_category || null, website || null, license || null, notes || null],
    });

    const result = await db().execute({ sql: 'SELECT * FROM vendors WHERE id = ?', args: [id] });
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('UNIQUE') && msg.includes('email')) {
      return NextResponse.json({ error: 'A vendor with this email already exists' }, { status: 409 });
    }
    console.error('Error creating vendor:', error);
    return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 });
  }
}
