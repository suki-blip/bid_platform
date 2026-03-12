import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedSaasUser, seedActivityLog } from '../helpers/test-db';
import { validatePassword } from '../../src/lib/auth';
import type Database from 'better-sqlite3';

describe('Admin Users', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  describe('Schema', () => {
    it('should have saas_users table with correct columns', () => {
      const cols = db.prepare("PRAGMA table_info(saas_users)").all() as any[];
      const names = cols.map(c => c.name);
      expect(names).toContain('id');
      expect(names).toContain('name');
      expect(names).toContain('company');
      expect(names).toContain('email');
      expect(names).toContain('password_hash');
      expect(names).toContain('status');
      expect(names).toContain('payment');
      expect(names).toContain('plan');
      expect(names).toContain('joined');
      expect(names).toContain('last_login');
    });
  });

  describe('CRUD', () => {
    it('should create and retrieve a user', () => {
      const id = seedSaasUser(db, { name: 'Alice', email: 'alice@test.com', company: 'Alice Co' });
      const user = db.prepare('SELECT * FROM saas_users WHERE id = ?').get(id) as any;
      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@test.com');
      expect(user.company).toBe('Alice Co');
    });

    it('should list all users', () => {
      seedSaasUser(db, { email: 'a@t.com' });
      seedSaasUser(db, { email: 'b@t.com' });
      seedSaasUser(db, { email: 'c@t.com' });
      const users = db.prepare('SELECT * FROM saas_users').all();
      expect(users).toHaveLength(3);
    });

    it('should enforce unique email', () => {
      seedSaasUser(db, { email: 'dup@test.com' });
      expect(() => seedSaasUser(db, { email: 'dup@test.com' })).toThrow();
    });
  });

  describe('Search & Filter', () => {
    it('should search by name', () => {
      seedSaasUser(db, { name: 'James Robertson', email: 'james@t.com' });
      seedSaasUser(db, { name: 'Sarah Chen', email: 'sarah@t.com' });
      const results = db.prepare("SELECT * FROM saas_users WHERE name LIKE ?").all('%james%') as any[];
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('James Robertson');
    });

    it('should search by email', () => {
      seedSaasUser(db, { name: 'James', email: 'james@robertson.com' });
      seedSaasUser(db, { name: 'Sarah', email: 'sarah@chen.com' });
      const results = db.prepare("SELECT * FROM saas_users WHERE email LIKE ?").all('%robertson%') as any[];
      expect(results).toHaveLength(1);
    });

    it('should filter by status', () => {
      seedSaasUser(db, { email: 'a@t.com', status: 'active' });
      seedSaasUser(db, { email: 'b@t.com', status: 'active' });
      seedSaasUser(db, { email: 'c@t.com', status: 'trial' });
      seedSaasUser(db, { email: 'd@t.com', status: 'suspended' });
      const active = db.prepare("SELECT * FROM saas_users WHERE status = 'active'").all();
      expect(active).toHaveLength(2);
      const trial = db.prepare("SELECT * FROM saas_users WHERE status = 'trial'").all();
      expect(trial).toHaveLength(1);
    });

    it('should filter unpaid users', () => {
      seedSaasUser(db, { email: 'a@t.com', payment: 'paid' });
      seedSaasUser(db, { email: 'b@t.com', payment: 'unpaid' });
      seedSaasUser(db, { email: 'c@t.com', payment: 'unpaid' });
      const unpaid = db.prepare("SELECT * FROM saas_users WHERE payment = 'unpaid'").all();
      expect(unpaid).toHaveLength(2);
    });
  });

  describe('Status transitions', () => {
    it('should suspend an active user', () => {
      const id = seedSaasUser(db, { email: 'a@t.com', status: 'active' });
      db.prepare("UPDATE saas_users SET status = 'suspended' WHERE id = ?").run(id);
      const user = db.prepare('SELECT status FROM saas_users WHERE id = ?').get(id) as any;
      expect(user.status).toBe('suspended');
    });

    it('should activate a suspended user', () => {
      const id = seedSaasUser(db, { email: 'a@t.com', status: 'suspended' });
      db.prepare("UPDATE saas_users SET status = 'active' WHERE id = ?").run(id);
      const user = db.prepare('SELECT status FROM saas_users WHERE id = ?').get(id) as any;
      expect(user.status).toBe('active');
    });

    it('should change password hash', () => {
      const id = seedSaasUser(db, { email: 'a@t.com' });
      db.prepare("UPDATE saas_users SET password_hash = ? WHERE id = ?").run('newhash:abc', id);
      const user = db.prepare('SELECT password_hash FROM saas_users WHERE id = ?').get(id) as any;
      expect(user.password_hash).toBe('newhash:abc');
    });
  });

  describe('Password validation', () => {
    it('should reject password shorter than 8 chars', () => {
      expect(validatePassword('short')).toEqual({ valid: false, error: 'Password must be at least 8 characters' });
    });

    it('should reject empty password', () => {
      expect(validatePassword('')).toEqual({ valid: false, error: 'Password must be at least 8 characters' });
    });

    it('should accept password with 8+ chars', () => {
      expect(validatePassword('longpassword')).toEqual({ valid: true });
    });
  });

  describe('KPI counts', () => {
    it('should count total users', () => {
      seedSaasUser(db, { email: 'a@t.com' });
      seedSaasUser(db, { email: 'b@t.com' });
      const result = db.prepare('SELECT COUNT(*) as count FROM saas_users').get() as any;
      expect(result.count).toBe(2);
    });

    it('should count active paying users', () => {
      seedSaasUser(db, { email: 'a@t.com', status: 'active', payment: 'paid' });
      seedSaasUser(db, { email: 'b@t.com', status: 'active', payment: 'unpaid' });
      seedSaasUser(db, { email: 'c@t.com', status: 'trial', payment: 'trial' });
      const result = db.prepare("SELECT COUNT(*) as count FROM saas_users WHERE status = 'active' AND payment = 'paid'").get() as any;
      expect(result.count).toBe(1);
    });

    it('should count unpaid users', () => {
      seedSaasUser(db, { email: 'a@t.com', payment: 'paid' });
      seedSaasUser(db, { email: 'b@t.com', payment: 'unpaid' });
      seedSaasUser(db, { email: 'c@t.com', payment: 'unpaid' });
      seedSaasUser(db, { email: 'd@t.com', payment: 'trial' });
      const result = db.prepare("SELECT COUNT(*) as count FROM saas_users WHERE payment = 'unpaid'").get() as any;
      expect(result.count).toBe(2);
    });
  });
});
