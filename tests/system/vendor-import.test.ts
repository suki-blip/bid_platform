import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedTradeCategory, seedVendor } from '../helpers/test-db';
import type Database from 'better-sqlite3';

// Simulates the CSV import logic that will live in the API
function importVendorsFromRows(db: Database.Database, rows: { name: string; email: string; phone?: string; trade?: string }[]) {
  const results = { created: 0, errors: [] as { row: number; reason: string }[] };

  // Build trade lookup
  const trades = db.prepare('SELECT id, name FROM trade_categories').all() as { id: string; name: string }[];
  const tradeLookup = new Map(trades.map(t => [t.name.toLowerCase(), t.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name || !row.email) {
      results.errors.push({ row: i + 1, reason: 'Missing name or email' });
      continue;
    }

    // Check duplicate email
    const existing = db.prepare('SELECT id FROM vendors WHERE email = ?').get(row.email);
    if (existing) {
      results.errors.push({ row: i + 1, reason: `Duplicate email: ${row.email}` });
      continue;
    }

    const tradeId = row.trade ? tradeLookup.get(row.trade.toLowerCase()) || null : null;
    const id = crypto.randomUUID();

    db.prepare('INSERT INTO vendors (id, name, email, phone, trade_category) VALUES (?, ?, ?, ?, ?)')
      .run(id, row.name, row.email, row.phone || null, tradeId);
    results.created++;
  }

  return results;
}

describe('Vendor CSV Import', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
    seedTradeCategory(db, { name: 'Plumbing', grp: 'MEP' });
    seedTradeCategory(db, { name: 'Electrical', grp: 'MEP' });
  });

  it('should import valid rows', () => {
    const result = importVendorsFromRows(db, [
      { name: 'Vendor A', email: 'a@test.com', phone: '555-0001', trade: 'Plumbing' },
      { name: 'Vendor B', email: 'b@test.com', phone: '555-0002', trade: 'Electrical' },
    ]);
    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(0);
    const vendors = db.prepare('SELECT * FROM vendors').all();
    expect(vendors).toHaveLength(2);
  });

  it('should match trade categories case-insensitively', () => {
    const result = importVendorsFromRows(db, [
      { name: 'Vendor A', email: 'a@test.com', trade: 'plumbing' },
      { name: 'Vendor B', email: 'b@test.com', trade: 'ELECTRICAL' },
    ]);
    expect(result.created).toBe(2);
    const vendors = db.prepare('SELECT trade_category FROM vendors').all() as any[];
    expect(vendors[0].trade_category).toBeTruthy();
    expect(vendors[1].trade_category).toBeTruthy();
  });

  it('should skip rows with missing name', () => {
    const result = importVendorsFromRows(db, [
      { name: '', email: 'a@test.com' },
      { name: 'Valid', email: 'b@test.com' },
    ]);
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('Missing name or email');
  });

  it('should skip rows with missing email', () => {
    const result = importVendorsFromRows(db, [
      { name: 'No Email', email: '' },
    ]);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('should skip duplicate emails', () => {
    seedVendor(db, { email: 'existing@test.com' });
    const result = importVendorsFromRows(db, [
      { name: 'Duplicate', email: 'existing@test.com' },
      { name: 'New Vendor', email: 'new@test.com' },
    ]);
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('Duplicate email');
  });

  it('should handle empty input', () => {
    const result = importVendorsFromRows(db, []);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should import vendors without a trade category', () => {
    const result = importVendorsFromRows(db, [
      { name: 'General Vendor', email: 'gen@test.com' },
    ]);
    expect(result.created).toBe(1);
    const vendor = db.prepare("SELECT * FROM vendors WHERE email = 'gen@test.com'").get() as any;
    expect(vendor.trade_category).toBeNull();
  });

  it('should set null trade for unknown trade names', () => {
    const result = importVendorsFromRows(db, [
      { name: 'Unknown Trade', email: 'u@test.com', trade: 'Nonexistent Trade' },
    ]);
    expect(result.created).toBe(1);
    const vendor = db.prepare("SELECT * FROM vendors WHERE email = 'u@test.com'").get() as any;
    expect(vendor.trade_category).toBeNull();
  });
});
