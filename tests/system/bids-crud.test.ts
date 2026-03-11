/**
 * System Tests: Bid CRUD Operations
 * Tests requirements from REQUIREMENTS.md related to bid creation and retrieval.
 * Maps to: existing POC features + P4 (Bid Request Enhancements)
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { getTestDb, cleanupTestDb, seedBid, seedProject } from '../helpers/test-db';

let db: Database.Database;

beforeEach(() => {
  db = getTestDb();
});

afterAll(() => {
  if (db?.open) db.close();
  cleanupTestDb();
});

describe('Bid Creation', () => {
  it('should create a bid with all required fields', () => {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO bids (id, title, description, deadline) VALUES (?, ?, ?, ?)').run(
      id, 'Office Furniture', 'Desks and chairs', '2026-06-01'
    );

    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(id) as any;
    expect(bid).toBeDefined();
    expect(bid.title).toBe('Office Furniture');
    expect(bid.description).toBe('Desks and chairs');
    expect(bid.deadline).toBe('2026-06-01');
    expect(bid.created_at).toBeDefined();
  });

  it('should create a bid with default status = draft', () => {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO bids (id, title, description, deadline) VALUES (?, ?, ?, ?)').run(
      id, 'Test Bid', 'Test desc', '2026-06-01'
    );

    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(id) as any;
    expect(bid.status).toBe('draft');
  });

  it('should create a bid with explicit status', () => {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO bids (id, title, description, deadline, status) VALUES (?, ?, ?, ?, ?)').run(
      id, 'Active Bid', 'Active desc', '2026-06-01', 'active'
    );

    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(id) as any;
    expect(bid.status).toBe('active');
  });

  it('should create a bid with project_id', () => {
    const projectId = seedProject(db, { name: 'Test Project' });
    const bidId = seedBid(db, { project_id: projectId });

    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bid.project_id).toBe(projectId);
  });

  it('should reject bids missing required fields', () => {
    expect(() => {
      db.prepare('INSERT INTO bids (id, title, description, deadline) VALUES (?, ?, ?, ?)').run(
        crypto.randomUUID(), null, 'desc', '2026-06-01'
      );
    }).toThrow();
  });

  it('should create bid with parameters and options', () => {
    const bidId = seedBid(db, {
      title: 'HVAC System',
      parameters: [
        { name: 'Brand', options: ['Carrier', 'Trane', 'Daikin'] },
        { name: 'Capacity', options: ['2 ton', '3 ton', '5 ton'] },
      ],
    });

    const params = db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ? ORDER BY sort_order').all(bidId) as any[];
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe('Brand');
    expect(params[1].name).toBe('Capacity');

    const brandOptions = db.prepare('SELECT value FROM bid_parameter_options WHERE parameter_id = ? ORDER BY sort_order').all(params[0].id) as any[];
    expect(brandOptions.map((o: any) => o.value)).toEqual(['Carrier', 'Trane', 'Daikin']);
  });

  it('should support bids with no parameters', () => {
    const bidId = seedBid(db, { parameters: [] });
    const params = db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ?').all(bidId);
    expect(params).toHaveLength(0);
  });

  it('should support parameters with single option', () => {
    const bidId = seedBid(db, {
      parameters: [{ name: 'Type', options: ['Standard'] }],
    });

    const params = db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ?').all(bidId) as any[];
    const options = db.prepare('SELECT value FROM bid_parameter_options WHERE parameter_id = ?').all(params[0].id) as any[];
    expect(options).toHaveLength(1);
    expect(options[0].value).toBe('Standard');
  });

  it('should support many parameters (scalability)', () => {
    const manyParams = Array.from({ length: 10 }, (_, i) => ({
      name: `Param ${i}`,
      options: ['A', 'B', 'C'],
    }));

    const bidId = seedBid(db, { parameters: manyParams });
    const params = db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ?').all(bidId);
    expect(params).toHaveLength(10);
  });
});

describe('Bid Retrieval', () => {
  it('should retrieve a bid with all nested data', () => {
    const bidId = seedBid(db, {
      title: 'Elevator Install',
      parameters: [
        { name: 'Floor Count', options: ['5', '10', '20'] },
        { name: 'Speed', options: ['Normal', 'Express'] },
      ],
    });

    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bid.title).toBe('Elevator Install');

    const params = db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ? ORDER BY sort_order').all(bidId) as any[];
    expect(params).toHaveLength(2);

    for (const param of params) {
      const options = db.prepare('SELECT * FROM bid_parameter_options WHERE parameter_id = ?').all(param.id);
      expect(options.length).toBeGreaterThan(0);
    }
  });

  it('should list all bids', () => {
    seedBid(db, { title: 'Bid 1' });
    seedBid(db, { title: 'Bid 2' });
    seedBid(db, { title: 'Bid 3' });

    const bids = db.prepare('SELECT * FROM bids').all();
    expect(bids).toHaveLength(3);
  });

  it('should return empty list when no bids exist', () => {
    const bids = db.prepare('SELECT * FROM bids').all();
    expect(bids).toHaveLength(0);
  });

  it('should return 404-equivalent for non-existent bid', () => {
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get('non-existent-id');
    expect(bid).toBeUndefined();
  });
});

describe('Bid Update', () => {
  it('should update bid title', () => {
    const bidId = seedBid(db, { title: 'Original Title' });
    db.prepare('UPDATE bids SET title = ? WHERE id = ?').run('Updated Title', bidId);
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bid.title).toBe('Updated Title');
  });

  it('should update bid description', () => {
    const bidId = seedBid(db, { description: 'Original' });
    db.prepare('UPDATE bids SET description = ? WHERE id = ?').run('Updated', bidId);
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bid.description).toBe('Updated');
  });

  it('should update bid deadline', () => {
    const bidId = seedBid(db);
    db.prepare('UPDATE bids SET deadline = ? WHERE id = ?').run('2027-01-01', bidId);
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bid.deadline).toBe('2027-01-01');
  });

  it('should update bid status', () => {
    const bidId = seedBid(db);
    db.prepare('UPDATE bids SET status = ? WHERE id = ?').run('active', bidId);
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bid.status).toBe('active');
  });
});

describe('Bid Deletion', () => {
  it('should delete bid and cascade to children', () => {
    const bidId = seedBid(db);

    // Add a file
    db.prepare('INSERT INTO bid_files (id, bid_id, filename, data) VALUES (?, ?, ?, ?)').run(
      crypto.randomUUID(), bidId, 'test.txt', Buffer.from('hello')
    );

    // Add a vendor response
    const respId = crypto.randomUUID();
    db.prepare('INSERT INTO vendor_responses (id, bid_id, vendor_name) VALUES (?, ?, ?)').run(
      respId, bidId, 'Vendor'
    );
    db.prepare('INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)').run(
      crypto.randomUUID(), respId, '{"A":"1"}', 100
    );

    db.prepare('DELETE FROM bids WHERE id = ?').run(bidId);

    expect(db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ?').all(bidId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM bid_files WHERE bid_id = ?').all(bidId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM vendor_responses WHERE bid_id = ?').all(bidId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM vendor_prices WHERE response_id = ?').all(respId)).toHaveLength(0);
  });

  it('should set project_id to NULL when project is deleted', () => {
    const projectId = seedProject(db, { name: 'To Delete' });
    const bidId = seedBid(db, { project_id: projectId });

    const bidBefore = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bidBefore.project_id).toBe(projectId);

    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    const bidAfter = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bidAfter.project_id).toBeNull();
  });
});

describe('Bid Data Integrity', () => {
  it('should cascade delete parameters when bid is deleted', () => {
    const bidId = seedBid(db);
    const paramsBefore = db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ?').all(bidId);
    expect(paramsBefore.length).toBeGreaterThan(0);

    db.prepare('DELETE FROM bids WHERE id = ?').run(bidId);

    const paramsAfter = db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ?').all(bidId);
    expect(paramsAfter).toHaveLength(0);
  });

  it('should cascade delete options when parameter is deleted', () => {
    const bidId = seedBid(db);
    const params = db.prepare('SELECT * FROM bid_parameters WHERE bid_id = ?').all(bidId) as any[];
    const paramId = params[0].id;

    const optionsBefore = db.prepare('SELECT * FROM bid_parameter_options WHERE parameter_id = ?').all(paramId);
    expect(optionsBefore.length).toBeGreaterThan(0);

    db.prepare('DELETE FROM bid_parameters WHERE id = ?').run(paramId);

    const optionsAfter = db.prepare('SELECT * FROM bid_parameter_options WHERE parameter_id = ?').all(paramId);
    expect(optionsAfter).toHaveLength(0);
  });

  it('should enforce foreign key on parameters', () => {
    expect(() => {
      db.prepare('INSERT INTO bid_parameters (id, bid_id, name) VALUES (?, ?, ?)').run(
        crypto.randomUUID(), 'non-existent-bid', 'Color'
      );
    }).toThrow();
  });

  it('should store created_at automatically', () => {
    const bidId = seedBid(db);
    const bid = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bid.created_at).toBeDefined();
    expect(bid.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
