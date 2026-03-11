import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedTradeCategory, seedVendor } from '../helpers/test-db';
import type Database from 'better-sqlite3';

describe('Vendor CRUD', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  describe('Create vendor', () => {
    it('should create a vendor with required fields', () => {
      const id = seedVendor(db, { name: 'Acme Plumbing', email: 'acme@test.com' });
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as any;
      expect(vendor.name).toBe('Acme Plumbing');
      expect(vendor.email).toBe('acme@test.com');
      expect(vendor.status).toBe('active');
    });

    it('should create a vendor with all profile fields', () => {
      const tradeId = seedTradeCategory(db, { name: 'Electrical', grp: 'MEP' });
      const id = seedVendor(db, {
        name: 'Spark Electric',
        email: 'spark@test.com',
        cc_emails: 'billing@spark.com,manager@spark.com',
        phone: '555-0100',
        contact_person: 'John Spark',
        trade_category: tradeId,
        website: 'https://spark.com',
        license: 'EL-12345',
        notes: 'Preferred vendor',
      });
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as any;
      expect(vendor.cc_emails).toBe('billing@spark.com,manager@spark.com');
      expect(vendor.phone).toBe('555-0100');
      expect(vendor.contact_person).toBe('John Spark');
      expect(vendor.trade_category).toBe(tradeId);
      expect(vendor.website).toBe('https://spark.com');
      expect(vendor.license).toBe('EL-12345');
      expect(vendor.notes).toBe('Preferred vendor');
    });

    it('should enforce unique email', () => {
      seedVendor(db, { email: 'dup@test.com' });
      expect(() => seedVendor(db, { email: 'dup@test.com' })).toThrow();
    });

    it('should set created_at automatically', () => {
      const id = seedVendor(db);
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as any;
      expect(vendor.created_at).toBeTruthy();
    });
  });

  describe('Read vendors', () => {
    it('should list all active vendors', () => {
      seedVendor(db, { name: 'Vendor A', email: 'a@test.com' });
      seedVendor(db, { name: 'Vendor B', email: 'b@test.com' });
      seedVendor(db, { name: 'Removed Vendor', email: 'r@test.com', status: 'removed' });
      const active = db.prepare("SELECT * FROM vendors WHERE status = 'active'").all();
      expect(active).toHaveLength(2);
    });

    it('should filter vendors by trade category', () => {
      const plumbingId = seedTradeCategory(db, { name: 'Plumbing', grp: 'MEP' });
      const electricId = seedTradeCategory(db, { name: 'Electrical', grp: 'MEP' });
      seedVendor(db, { name: 'Plumber', email: 'p@test.com', trade_category: plumbingId });
      seedVendor(db, { name: 'Electrician', email: 'e@test.com', trade_category: electricId });
      const plumbers = db.prepare('SELECT * FROM vendors WHERE trade_category = ?').all(plumbingId);
      expect(plumbers).toHaveLength(1);
      expect((plumbers[0] as any).name).toBe('Plumber');
    });
  });

  describe('Update vendor', () => {
    it('should update vendor profile fields', () => {
      const id = seedVendor(db, { name: 'Old Name', email: 'old@test.com' });
      db.prepare('UPDATE vendors SET name = ?, phone = ? WHERE id = ?').run('New Name', '555-9999', id);
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as any;
      expect(vendor.name).toBe('New Name');
      expect(vendor.phone).toBe('555-9999');
    });

    it('should suspend a vendor', () => {
      const id = seedVendor(db);
      db.prepare("UPDATE vendors SET status = 'suspended' WHERE id = ?").run(id);
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as any;
      expect(vendor.status).toBe('suspended');
    });

    it('should reactivate a suspended vendor', () => {
      const id = seedVendor(db, { status: 'suspended' });
      db.prepare("UPDATE vendors SET status = 'active' WHERE id = ?").run(id);
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as any;
      expect(vendor.status).toBe('active');
    });
  });

  describe('Soft-delete vendor', () => {
    it('should soft-remove a vendor by setting status', () => {
      const id = seedVendor(db);
      db.prepare("UPDATE vendors SET status = 'removed' WHERE id = ?").run(id);
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as any;
      expect(vendor.status).toBe('removed');
      // Still exists in DB
      expect(vendor).toBeTruthy();
    });

    it('should exclude removed vendors from active list', () => {
      seedVendor(db, { email: 'a@test.com', status: 'active' });
      seedVendor(db, { email: 'b@test.com', status: 'removed' });
      const active = db.prepare("SELECT * FROM vendors WHERE status != 'removed'").all();
      expect(active).toHaveLength(1);
    });
  });

  describe('Trade category FK', () => {
    it('should set trade_category to null when category is deleted', () => {
      const tradeId = seedTradeCategory(db, { name: 'HVAC', grp: 'MEP' });
      const vendorId = seedVendor(db, { trade_category: tradeId });
      db.prepare('DELETE FROM trade_categories WHERE id = ?').run(tradeId);
      const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendorId) as any;
      expect(vendor.trade_category).toBeNull();
    });
  });
});
