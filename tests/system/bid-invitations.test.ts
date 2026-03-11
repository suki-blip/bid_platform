import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedProject, seedBid, seedVendor, seedBidInvitation } from '../helpers/test-db';
import type Database from 'better-sqlite3';

describe('Bid Invitations', () => {
  let db: Database.Database;
  let projectId: string;
  let bidId: string;
  let vendorId: string;

  beforeEach(() => {
    db = getTestDb();
    projectId = seedProject(db);
    bidId = seedBid(db, { project_id: projectId, status: 'active' });
    vendorId = seedVendor(db, { name: 'Test Vendor', email: 'test@vendor.com' });
  });

  describe('Create invitation', () => {
    it('should create an invitation with a unique token', () => {
      const { id, token } = seedBidInvitation(db, bidId, vendorId);
      const inv = db.prepare('SELECT * FROM bid_invitations WHERE id = ?').get(id) as any;
      expect(inv.bid_id).toBe(bidId);
      expect(inv.vendor_id).toBe(vendorId);
      expect(inv.token).toBe(token);
      expect(inv.status).toBe('pending');
      expect(inv.sent_at).toBeTruthy();
    });

    it('should enforce unique tokens', () => {
      seedBidInvitation(db, bidId, vendorId, { token: 'same-token' });
      const vendor2 = seedVendor(db, { email: 'v2@test.com' });
      expect(() => seedBidInvitation(db, bidId, vendor2, { token: 'same-token' })).toThrow();
    });

    it('should allow multiple vendors per bid', () => {
      const v2 = seedVendor(db, { email: 'v2@test.com' });
      const v3 = seedVendor(db, { email: 'v3@test.com' });
      seedBidInvitation(db, bidId, vendorId);
      seedBidInvitation(db, bidId, v2);
      seedBidInvitation(db, bidId, v3);
      const invitations = db.prepare('SELECT * FROM bid_invitations WHERE bid_id = ?').all(bidId);
      expect(invitations).toHaveLength(3);
    });

    it('should allow same vendor on different bids', () => {
      const bid2 = seedBid(db, { title: 'Bid 2', project_id: projectId });
      seedBidInvitation(db, bidId, vendorId);
      seedBidInvitation(db, bid2, vendorId);
      const invitations = db.prepare('SELECT * FROM bid_invitations WHERE vendor_id = ?').all(vendorId);
      expect(invitations).toHaveLength(2);
    });
  });

  describe('Status transitions', () => {
    it('should transition from pending to opened', () => {
      const { id } = seedBidInvitation(db, bidId, vendorId);
      db.prepare("UPDATE bid_invitations SET status = 'opened', opened_at = datetime('now') WHERE id = ?").run(id);
      const inv = db.prepare('SELECT * FROM bid_invitations WHERE id = ?').get(id) as any;
      expect(inv.status).toBe('opened');
      expect(inv.opened_at).toBeTruthy();
    });

    it('should transition from opened to submitted', () => {
      const { id } = seedBidInvitation(db, bidId, vendorId, { status: 'opened' });
      db.prepare("UPDATE bid_invitations SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?").run(id);
      const inv = db.prepare('SELECT * FROM bid_invitations WHERE id = ?').get(id) as any;
      expect(inv.status).toBe('submitted');
      expect(inv.submitted_at).toBeTruthy();
    });

    it('should support declined status', () => {
      const { id } = seedBidInvitation(db, bidId, vendorId);
      db.prepare("UPDATE bid_invitations SET status = 'declined' WHERE id = ?").run(id);
      const inv = db.prepare('SELECT * FROM bid_invitations WHERE id = ?').get(id) as any;
      expect(inv.status).toBe('declined');
    });

    it('should support expired status', () => {
      const { id } = seedBidInvitation(db, bidId, vendorId);
      db.prepare("UPDATE bid_invitations SET status = 'expired' WHERE id = ?").run(id);
      const inv = db.prepare('SELECT * FROM bid_invitations WHERE id = ?').get(id) as any;
      expect(inv.status).toBe('expired');
    });
  });

  describe('Token lookup', () => {
    it('should find invitation by token', () => {
      const { token } = seedBidInvitation(db, bidId, vendorId, { token: 'lookup-token-123' });
      const inv = db.prepare('SELECT * FROM bid_invitations WHERE token = ?').get(token) as any;
      expect(inv).toBeTruthy();
      expect(inv.bid_id).toBe(bidId);
    });

    it('should return null for unknown token', () => {
      const inv = db.prepare('SELECT * FROM bid_invitations WHERE token = ?').get('nonexistent');
      expect(inv).toBeUndefined();
    });

    it('should join with bid and vendor data', () => {
      const { token } = seedBidInvitation(db, bidId, vendorId);
      const result = db.prepare(`
        SELECT bi.*, b.title as bid_title, b.deadline, v.name as vendor_name
        FROM bid_invitations bi
        JOIN bids b ON b.id = bi.bid_id
        JOIN vendors v ON v.id = bi.vendor_id
        WHERE bi.token = ?
      `).get(token) as any;
      expect(result.bid_title).toBe('Test Bid');
      expect(result.vendor_name).toBe('Test Vendor');
    });
  });

  describe('Cascade deletes', () => {
    it('should delete invitations when bid is deleted', () => {
      seedBidInvitation(db, bidId, vendorId);
      db.prepare('DELETE FROM bids WHERE id = ?').run(bidId);
      const invitations = db.prepare('SELECT * FROM bid_invitations WHERE bid_id = ?').all(bidId);
      expect(invitations).toHaveLength(0);
    });

    it('should delete invitations when vendor is deleted', () => {
      seedBidInvitation(db, bidId, vendorId);
      db.prepare('DELETE FROM vendors WHERE id = ?').run(vendorId);
      const invitations = db.prepare('SELECT * FROM bid_invitations WHERE vendor_id = ?').all(vendorId);
      expect(invitations).toHaveLength(0);
    });
  });
});
