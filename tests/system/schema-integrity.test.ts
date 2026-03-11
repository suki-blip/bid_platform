/**
 * System Tests: Database Schema Integrity
 * Tests that the database schema meets requirements for data model.
 * Maps to: Data Model section of REQUIREMENTS.md
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { getTestDb, cleanupTestDb } from '../helpers/test-db';

let db: Database.Database;

beforeEach(() => {
  db = getTestDb();
});

afterAll(() => {
  if (db?.open) db.close();
  cleanupTestDb();
});

describe('Table Existence', () => {
  const requiredTables = [
    'projects',
    'bids',
    'bid_parameters',
    'bid_parameter_options',
    'bid_files',
    'vendor_responses',
    'vendor_prices',
  ];

  for (const table of requiredTables) {
    it(`should have ${table} table`, () => {
      const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table) as any;
      expect(result).toBeDefined();
      expect(result.name).toBe(table);
    });
  }
});

describe('Column Schema', () => {
  it('projects table should have all required columns', () => {
    const columns = db.prepare("PRAGMA table_info('projects')").all() as any[];
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('address');
    expect(colNames).toContain('type');
    expect(colNames).toContain('description');
    expect(colNames).toContain('status');
    expect(colNames).toContain('created_at');
  });

  it('bids table should have all required columns', () => {
    const columns = db.prepare("PRAGMA table_info('bids')").all() as any[];
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('title');
    expect(colNames).toContain('description');
    expect(colNames).toContain('deadline');
    expect(colNames).toContain('status');
    expect(colNames).toContain('project_id');
    expect(colNames).toContain('created_at');
  });

  it('bids.status should default to draft', () => {
    const columns = db.prepare("PRAGMA table_info('bids')").all() as any[];
    const statusCol = columns.find((c: any) => c.name === 'status') as any;
    expect(statusCol).toBeDefined();
    expect(statusCol.dflt_value).toBe("'draft'");
  });

  it('bids.project_id column should exist', () => {
    const columns = db.prepare("PRAGMA table_info('bids')").all() as any[];
    const projectIdCol = columns.find((c: any) => c.name === 'project_id') as any;
    expect(projectIdCol).toBeDefined();
  });

  it('bid_parameters table should have all required columns', () => {
    const columns = db.prepare("PRAGMA table_info('bid_parameters')").all() as any[];
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('bid_id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('sort_order');
  });

  it('bid_parameter_options table should have all required columns', () => {
    const columns = db.prepare("PRAGMA table_info('bid_parameter_options')").all() as any[];
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('parameter_id');
    expect(colNames).toContain('value');
    expect(colNames).toContain('sort_order');
  });

  it('vendor_responses table should have pricing mode columns', () => {
    const columns = db.prepare("PRAGMA table_info('vendor_responses')").all() as any[];
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('bid_id');
    expect(colNames).toContain('vendor_name');
    expect(colNames).toContain('pricing_mode');
    expect(colNames).toContain('base_price');
    expect(colNames).toContain('rules');
    expect(colNames).toContain('submitted_at');
  });

  it('vendor_prices table should have all required columns', () => {
    const columns = db.prepare("PRAGMA table_info('vendor_prices')").all() as any[];
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('response_id');
    expect(colNames).toContain('combination_key');
    expect(colNames).toContain('price');
  });

  it('bid_files table should have all required columns', () => {
    const columns = db.prepare("PRAGMA table_info('bid_files')").all() as any[];
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('bid_id');
    expect(colNames).toContain('filename');
    expect(colNames).toContain('data');
  });
});

describe('Foreign Keys', () => {
  it('should have foreign keys enabled', () => {
    const result = db.pragma('foreign_keys') as any[];
    expect(result[0].foreign_keys).toBe(1);
  });

  it('bid_parameters should reference bids', () => {
    const fks = db.prepare("PRAGMA foreign_key_list('bid_parameters')").all() as any[];
    const bidFK = fks.find((fk: any) => fk.table === 'bids');
    expect(bidFK).toBeDefined();
    expect(bidFK.from).toBe('bid_id');
    expect(bidFK.to).toBe('id');
  });

  it('bid_parameter_options should reference bid_parameters', () => {
    const fks = db.prepare("PRAGMA foreign_key_list('bid_parameter_options')").all() as any[];
    const paramFK = fks.find((fk: any) => fk.table === 'bid_parameters');
    expect(paramFK).toBeDefined();
    expect(paramFK.from).toBe('parameter_id');
  });

  it('vendor_responses should reference bids', () => {
    const fks = db.prepare("PRAGMA foreign_key_list('vendor_responses')").all() as any[];
    const bidFK = fks.find((fk: any) => fk.table === 'bids');
    expect(bidFK).toBeDefined();
  });

  it('vendor_prices should reference vendor_responses', () => {
    const fks = db.prepare("PRAGMA foreign_key_list('vendor_prices')").all() as any[];
    const respFK = fks.find((fk: any) => fk.table === 'vendor_responses');
    expect(respFK).toBeDefined();
    expect(respFK.from).toBe('response_id');
  });
});

describe('NOT NULL Constraints', () => {
  it('should require bid title', () => {
    expect(() => {
      db.prepare('INSERT INTO bids (id, title, description, deadline) VALUES (?, ?, ?, ?)').run(
        crypto.randomUUID(), null, 'desc', '2026-01-01'
      );
    }).toThrow();
  });

  it('should require vendor_name in responses', () => {
    const bidId = crypto.randomUUID();
    db.prepare('INSERT INTO bids (id, title, description, deadline) VALUES (?, ?, ?, ?)').run(
      bidId, 'Test', 'Desc', '2026-01-01'
    );

    expect(() => {
      db.prepare('INSERT INTO vendor_responses (id, bid_id, vendor_name) VALUES (?, ?, ?)').run(
        crypto.randomUUID(), bidId, null
      );
    }).toThrow();
  });

  it('should require price in vendor_prices', () => {
    const bidId = crypto.randomUUID();
    db.prepare('INSERT INTO bids (id, title, description, deadline) VALUES (?, ?, ?, ?)').run(
      bidId, 'Test', 'Desc', '2026-01-01'
    );
    const respId = crypto.randomUUID();
    db.prepare('INSERT INTO vendor_responses (id, bid_id, vendor_name) VALUES (?, ?, ?)').run(
      respId, bidId, 'Vendor'
    );

    expect(() => {
      db.prepare('INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)').run(
        crypto.randomUUID(), respId, '{"A":"1"}', null
      );
    }).toThrow();
  });
});

describe('Default Values', () => {
  it('pricing_mode should default to combination', () => {
    const bidId = crypto.randomUUID();
    db.prepare('INSERT INTO bids (id, title, description, deadline) VALUES (?, ?, ?, ?)').run(
      bidId, 'Test', 'Desc', '2026-01-01'
    );

    const respId = crypto.randomUUID();
    db.prepare('INSERT INTO vendor_responses (id, bid_id, vendor_name) VALUES (?, ?, ?)').run(
      respId, bidId, 'Vendor'
    );

    const response = db.prepare('SELECT pricing_mode FROM vendor_responses WHERE id = ?').get(respId) as any;
    expect(response.pricing_mode).toBe('combination');
  });

  it('sort_order should default to 0', () => {
    const bidId = crypto.randomUUID();
    db.prepare('INSERT INTO bids (id, title, description, deadline) VALUES (?, ?, ?, ?)').run(
      bidId, 'Test', 'Desc', '2026-01-01'
    );

    const paramId = crypto.randomUUID();
    db.prepare('INSERT INTO bid_parameters (id, bid_id, name) VALUES (?, ?, ?)').run(
      paramId, bidId, 'Color'
    );

    const param = db.prepare('SELECT sort_order FROM bid_parameters WHERE id = ?').get(paramId) as any;
    expect(param.sort_order).toBe(0);
  });
});
