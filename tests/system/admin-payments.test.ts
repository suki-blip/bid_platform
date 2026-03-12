import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedSaasUser, seedPayment } from '../helpers/test-db';
import type Database from 'better-sqlite3';

describe('Admin Payments', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  describe('Schema', () => {
    it('should have payments table with correct columns', () => {
      const cols = db.prepare("PRAGMA table_info(payments)").all() as any[];
      const names = cols.map(c => c.name);
      expect(names).toContain('id');
      expect(names).toContain('user_id');
      expect(names).toContain('date');
      expect(names).toContain('amount');
      expect(names).toContain('status');
    });

    it('should have FK to saas_users', () => {
      expect(() => {
        db.prepare("INSERT INTO payments (id, user_id, date, amount, status) VALUES ('p1', 'nonexistent', '2026-03-01', 199, 'paid')").run();
      }).toThrow();
    });
  });

  describe('CRUD', () => {
    it('should create and list payments', () => {
      const uid = seedSaasUser(db, { email: 'a@t.com' });
      seedPayment(db, uid, { amount: 199, status: 'paid' });
      seedPayment(db, uid, { amount: 199, status: 'failed' });
      const payments = db.prepare('SELECT * FROM payments').all();
      expect(payments).toHaveLength(2);
    });

    it('should join payments with user info', () => {
      const uid = seedSaasUser(db, { name: 'James', email: 'james@t.com' });
      seedPayment(db, uid, { amount: 199 });
      const result = db.prepare(`
        SELECT p.*, u.name, u.email FROM payments p
        JOIN saas_users u ON u.id = p.user_id
      `).all() as any[];
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('James');
      expect(result[0].amount).toBe(199);
    });

    it('should order payments by date descending', () => {
      const uid = seedSaasUser(db, { email: 'a@t.com' });
      seedPayment(db, uid, { date: '2026-03-01', amount: 199 });
      seedPayment(db, uid, { date: '2026-03-10', amount: 199 });
      seedPayment(db, uid, { date: '2026-03-05', amount: 199 });
      const payments = db.prepare('SELECT * FROM payments ORDER BY date DESC').all() as any[];
      expect(payments[0].date).toBe('2026-03-10');
      expect(payments[2].date).toBe('2026-03-01');
    });
  });

  describe('KPI calculations', () => {
    it('should calculate MRR for current month', () => {
      const uid = seedSaasUser(db, { email: 'a@t.com' });
      const uid2 = seedSaasUser(db, { email: 'b@t.com' });
      const monthStart = new Date().toISOString().slice(0, 7) + '-01';
      seedPayment(db, uid, { date: monthStart, amount: 199, status: 'paid' });
      seedPayment(db, uid2, { date: monthStart, amount: 199, status: 'paid' });
      seedPayment(db, uid, { date: monthStart, amount: 199, status: 'failed' });
      seedPayment(db, uid, { date: '2025-01-01', amount: 199, status: 'paid' }); // old month
      const result = db.prepare("SELECT COALESCE(SUM(amount), 0) as mrr FROM payments WHERE status = 'paid' AND date >= ?").get(monthStart) as any;
      expect(result.mrr).toBe(398);
    });

    it('should calculate failed payment amount', () => {
      const uid = seedSaasUser(db, { email: 'a@t.com' });
      seedPayment(db, uid, { amount: 199, status: 'paid' });
      seedPayment(db, uid, { amount: 199, status: 'failed' });
      seedPayment(db, uid, { amount: 199, status: 'failed' });
      const result = db.prepare("SELECT COALESCE(SUM(amount), 0) as failed FROM payments WHERE status = 'failed'").get() as any;
      expect(result.failed).toBe(398);
    });

    it('should count paying users', () => {
      seedSaasUser(db, { email: 'a@t.com', payment: 'paid' });
      seedSaasUser(db, { email: 'b@t.com', payment: 'paid' });
      seedSaasUser(db, { email: 'c@t.com', payment: 'unpaid' });
      seedSaasUser(db, { email: 'd@t.com', payment: 'trial' });
      const result = db.prepare("SELECT COUNT(*) as count FROM saas_users WHERE payment = 'paid'").get() as any;
      expect(result.count).toBe(2);
    });
  });

  describe('Cascade', () => {
    it('should delete payments when user is deleted', () => {
      const uid = seedSaasUser(db, { email: 'a@t.com' });
      seedPayment(db, uid);
      seedPayment(db, uid);
      db.prepare('DELETE FROM saas_users WHERE id = ?').run(uid);
      const payments = db.prepare('SELECT * FROM payments').all();
      expect(payments).toHaveLength(0);
    });
  });

  describe('Empty state', () => {
    it('should return 0 MRR for empty database', () => {
      const monthStart = new Date().toISOString().slice(0, 7) + '-01';
      const result = db.prepare("SELECT COALESCE(SUM(amount), 0) as mrr FROM payments WHERE status = 'paid' AND date >= ?").get(monthStart) as any;
      expect(result.mrr).toBe(0);
    });
  });
});
