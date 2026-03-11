import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedTradeCategory, seedVendor } from '../helpers/test-db';
import type Database from 'better-sqlite3';

const DEFAULT_CATEGORIES = [
  { name: 'General Construction', grp: 'Structure' },
  { name: 'Concrete', grp: 'Structure' },
  { name: 'Structural Steel', grp: 'Structure' },
  { name: 'Masonry', grp: 'Structure' },
  { name: 'Carpentry', grp: 'Structure' },
  { name: 'Roofing', grp: 'Structure' },
  { name: 'Waterproofing', grp: 'Structure' },
  { name: 'Plumbing', grp: 'MEP' },
  { name: 'HVAC', grp: 'MEP' },
  { name: 'Electrical', grp: 'MEP' },
  { name: 'Fire Protection', grp: 'MEP' },
  { name: 'Low Voltage', grp: 'MEP' },
  { name: 'Elevator', grp: 'MEP' },
  { name: 'Painting', grp: 'Finishes' },
  { name: 'Flooring', grp: 'Finishes' },
  { name: 'Tile', grp: 'Finishes' },
  { name: 'Drywall', grp: 'Finishes' },
  { name: 'Millwork', grp: 'Finishes' },
  { name: 'Glass & Glazing', grp: 'Finishes' },
  { name: 'Doors & Hardware', grp: 'Finishes' },
  { name: 'Kitchen Equipment', grp: 'Finishes' },
  { name: 'Demolition', grp: 'Site' },
  { name: 'Excavation', grp: 'Site' },
  { name: 'Landscaping', grp: 'Site' },
  { name: 'Paving', grp: 'Site' },
];

describe('Trade Categories', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  describe('Default categories', () => {
    it('should insert all 25 default categories', () => {
      for (const cat of DEFAULT_CATEGORIES) {
        seedTradeCategory(db, { name: cat.name, grp: cat.grp });
      }
      const count = db.prepare('SELECT COUNT(*) as count FROM trade_categories').get() as any;
      expect(count.count).toBe(25);
    });

    it('should have correct groups', () => {
      for (const cat of DEFAULT_CATEGORIES) {
        seedTradeCategory(db, { name: cat.name, grp: cat.grp });
      }
      const structure = db.prepare("SELECT * FROM trade_categories WHERE grp = 'Structure'").all();
      const mep = db.prepare("SELECT * FROM trade_categories WHERE grp = 'MEP'").all();
      const finishes = db.prepare("SELECT * FROM trade_categories WHERE grp = 'Finishes'").all();
      const site = db.prepare("SELECT * FROM trade_categories WHERE grp = 'Site'").all();
      expect(structure).toHaveLength(7);
      expect(mep).toHaveLength(6);
      expect(finishes).toHaveLength(8);
      expect(site).toHaveLength(4);
    });

    it('should enforce unique category names', () => {
      seedTradeCategory(db, { name: 'Plumbing' });
      expect(() => seedTradeCategory(db, { name: 'Plumbing' })).toThrow();
    });
  });

  describe('Custom categories', () => {
    it('should create a custom category', () => {
      const id = seedTradeCategory(db, { name: 'Solar Panels', grp: 'MEP', is_custom: 1 });
      const cat = db.prepare('SELECT * FROM trade_categories WHERE id = ?').get(id) as any;
      expect(cat.name).toBe('Solar Panels');
      expect(cat.is_custom).toBe(1);
    });

    it('should distinguish custom from default categories', () => {
      seedTradeCategory(db, { name: 'Plumbing', grp: 'MEP', is_custom: 0 });
      seedTradeCategory(db, { name: 'Custom Trade', grp: 'Other', is_custom: 1 });
      const customs = db.prepare('SELECT * FROM trade_categories WHERE is_custom = 1').all();
      const defaults = db.prepare('SELECT * FROM trade_categories WHERE is_custom = 0').all();
      expect(customs).toHaveLength(1);
      expect(defaults).toHaveLength(1);
    });
  });

  describe('Vendor association', () => {
    it('should list vendors by trade category', () => {
      const plumbingId = seedTradeCategory(db, { name: 'Plumbing', grp: 'MEP' });
      const hvacId = seedTradeCategory(db, { name: 'HVAC', grp: 'MEP' });
      seedVendor(db, { name: 'Plumber A', email: 'pa@test.com', trade_category: plumbingId });
      seedVendor(db, { name: 'Plumber B', email: 'pb@test.com', trade_category: plumbingId });
      seedVendor(db, { name: 'HVAC Co', email: 'hvac@test.com', trade_category: hvacId });

      const plumbers = db.prepare('SELECT * FROM vendors WHERE trade_category = ?').all(plumbingId);
      expect(plumbers).toHaveLength(2);
    });

    it('should allow vendors without a trade category', () => {
      const id = seedVendor(db, { name: 'General', email: 'gen@test.com', trade_category: null });
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as any;
      expect(vendor.trade_category).toBeNull();
    });
  });
});
