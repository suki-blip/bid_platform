import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedActivityLog } from '../helpers/test-db';
import type Database from 'better-sqlite3';

// Color mapping helper (same logic the UI will use)
function getActivityColor(type: string): string {
  const map: Record<string, string> = {
    payment: 'var(--green)',
    signup: 'var(--blue)',
    failed: 'var(--red)',
    suspend: 'var(--orange)',
    activate: 'var(--green)',
    login: 'var(--blue)',
    message: 'var(--gold)',
    admin: 'var(--muted)',
  };
  return map[type] || 'var(--muted)';
}

describe('Admin Activity Log', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  describe('Schema', () => {
    it('should have activity_log table with correct columns', () => {
      const cols = db.prepare("PRAGMA table_info(activity_log)").all() as any[];
      const names = cols.map(c => c.name);
      expect(names).toContain('id');
      expect(names).toContain('type');
      expect(names).toContain('text');
      expect(names).toContain('created_at');
    });
  });

  describe('Event types', () => {
    it('should accept all event types', () => {
      const types = ['payment', 'signup', 'failed', 'suspend', 'activate', 'login', 'message', 'admin'];
      types.forEach(type => {
        seedActivityLog(db, { type, text: `Test ${type}` });
      });
      const logs = db.prepare('SELECT * FROM activity_log').all();
      expect(logs).toHaveLength(8);
    });
  });

  describe('Feed ordering', () => {
    it('should return entries newest first', () => {
      seedActivityLog(db, { text: 'Old', created_at: '2026-03-01 10:00:00' });
      seedActivityLog(db, { text: 'New', created_at: '2026-03-10 10:00:00' });
      seedActivityLog(db, { text: 'Mid', created_at: '2026-03-05 10:00:00' });
      const logs = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC').all() as any[];
      expect(logs[0].text).toBe('New');
      expect(logs[1].text).toBe('Mid');
      expect(logs[2].text).toBe('Old');
    });
  });

  describe('Pagination', () => {
    it('should support limit and offset', () => {
      for (let i = 0; i < 20; i++) {
        seedActivityLog(db, { text: `Event ${i}`, created_at: `2026-03-${String(i + 1).padStart(2, '0')} 10:00:00` });
      }
      const page1 = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 5 OFFSET 0').all();
      expect(page1).toHaveLength(5);
      const page2 = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 5 OFFSET 5').all();
      expect(page2).toHaveLength(5);
      // Pages should not overlap
      const ids1 = new Set(page1.map((r: any) => r.id));
      const ids2 = new Set(page2.map((r: any) => r.id));
      expect([...ids1].filter(id => ids2.has(id))).toHaveLength(0);
    });
  });

  describe('Color mapping', () => {
    it('should map payment to green', () => {
      expect(getActivityColor('payment')).toBe('var(--green)');
    });
    it('should map signup to blue', () => {
      expect(getActivityColor('signup')).toBe('var(--blue)');
    });
    it('should map failed to red', () => {
      expect(getActivityColor('failed')).toBe('var(--red)');
    });
    it('should map suspend to orange', () => {
      expect(getActivityColor('suspend')).toBe('var(--orange)');
    });
    it('should map unknown type to muted', () => {
      expect(getActivityColor('unknown')).toBe('var(--muted)');
    });
  });

  describe('Empty state', () => {
    it('should return empty array for empty log', () => {
      const logs = db.prepare('SELECT * FROM activity_log').all();
      expect(logs).toHaveLength(0);
    });
  });
});
