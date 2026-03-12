import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedSaasUser, seedAdminMessage } from '../helpers/test-db';
import type Database from 'better-sqlite3';

// Template rendering helper (same logic the API will use)
function renderTemplate(body: string, user: { name: string; email: string; plan: string }): string {
  return body
    .replace(/\{\{name\}\}/g, user.name)
    .replace(/\{\{email\}\}/g, user.email)
    .replace(/\{\{plan\}\}/g, user.plan);
}

// Recipient filtering helper
function getRecipients(db: Database.Database, filter: { type: string; custom_ids?: string[] }) {
  if (filter.type === 'custom' && filter.custom_ids) {
    const placeholders = filter.custom_ids.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM saas_users WHERE id IN (${placeholders})`).all(...filter.custom_ids);
  }
  const statusMap: Record<string, string> = {
    active: "status = 'active'",
    trial: "status = 'trial'",
    suspended: "status = 'suspended'",
    unpaid: "payment = 'unpaid'",
  };
  const where = statusMap[filter.type];
  if (where) return db.prepare(`SELECT * FROM saas_users WHERE ${where}`).all();
  return db.prepare('SELECT * FROM saas_users').all(); // 'all'
}

describe('Admin Messages', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getTestDb();
  });

  describe('Schema', () => {
    it('should have admin_messages table with correct columns', () => {
      const cols = db.prepare("PRAGMA table_info(admin_messages)").all() as any[];
      const names = cols.map(c => c.name);
      expect(names).toContain('id');
      expect(names).toContain('subject');
      expect(names).toContain('body');
      expect(names).toContain('recipients_filter');
      expect(names).toContain('recipient_count');
      expect(names).toContain('sent_at');
    });
  });

  describe('Template rendering', () => {
    it('should replace {{name}} placeholder', () => {
      const result = renderTemplate('Hi {{name}}, welcome!', { name: 'James', email: 'j@t.com', plan: 'Pro' });
      expect(result).toBe('Hi James, welcome!');
    });

    it('should replace all placeholders', () => {
      const result = renderTemplate('Hi {{name}}, your email is {{email}} on {{plan}} plan', { name: 'Sarah', email: 'sarah@t.com', plan: 'Trial' });
      expect(result).toBe('Hi Sarah, your email is sarah@t.com on Trial plan');
    });

    it('should handle multiple occurrences of same placeholder', () => {
      const result = renderTemplate('{{name}} is great. Thanks {{name}}!', { name: 'Mike', email: '', plan: '' });
      expect(result).toBe('Mike is great. Thanks Mike!');
    });
  });

  describe('Recipient filtering', () => {
    it('should return all users for "all" filter', () => {
      seedSaasUser(db, { email: 'a@t.com', status: 'active' });
      seedSaasUser(db, { email: 'b@t.com', status: 'trial' });
      seedSaasUser(db, { email: 'c@t.com', status: 'suspended' });
      const recipients = getRecipients(db, { type: 'all' });
      expect(recipients).toHaveLength(3);
    });

    it('should filter active users', () => {
      seedSaasUser(db, { email: 'a@t.com', status: 'active' });
      seedSaasUser(db, { email: 'b@t.com', status: 'trial' });
      const recipients = getRecipients(db, { type: 'active' });
      expect(recipients).toHaveLength(1);
    });

    it('should filter unpaid users', () => {
      seedSaasUser(db, { email: 'a@t.com', payment: 'paid' });
      seedSaasUser(db, { email: 'b@t.com', payment: 'unpaid' });
      seedSaasUser(db, { email: 'c@t.com', payment: 'unpaid' });
      const recipients = getRecipients(db, { type: 'unpaid' });
      expect(recipients).toHaveLength(2);
    });

    it('should filter custom user IDs', () => {
      const id1 = seedSaasUser(db, { email: 'a@t.com' });
      seedSaasUser(db, { email: 'b@t.com' });
      const id3 = seedSaasUser(db, { email: 'c@t.com' });
      const recipients = getRecipients(db, { type: 'custom', custom_ids: [id1, id3] });
      expect(recipients).toHaveLength(2);
    });
  });

  describe('Message history', () => {
    it('should store and retrieve sent messages', () => {
      seedAdminMessage(db, { subject: 'Test', recipient_count: 5 });
      const messages = db.prepare('SELECT * FROM admin_messages ORDER BY sent_at DESC').all() as any[];
      expect(messages).toHaveLength(1);
      expect(messages[0].subject).toBe('Test');
      expect(messages[0].recipient_count).toBe(5);
    });

    it('should order messages newest first', () => {
      seedAdminMessage(db, { subject: 'Old', sent_at: '2026-03-01 10:00:00' });
      seedAdminMessage(db, { subject: 'New', sent_at: '2026-03-10 10:00:00' });
      const messages = db.prepare('SELECT * FROM admin_messages ORDER BY sent_at DESC').all() as any[];
      expect(messages[0].subject).toBe('New');
    });
  });
});
