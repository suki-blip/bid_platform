import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb, seedProject, seedBid, seedVendor, seedBidInvitation } from '../helpers/test-db';
import type Database from 'better-sqlite3';

// Simulates the token-based submission logic that will live in the API
function submitViaToken(db: Database.Database, token: string, prices: { combination_key: string; price: number }[]) {
  // Look up invitation
  const invitation = db.prepare(`
    SELECT bi.*, b.deadline, b.status as bid_status
    FROM bid_invitations bi
    JOIN bids b ON b.id = bi.bid_id
    WHERE bi.token = ?
  `).get(token) as any;

  if (!invitation) {
    return { error: 'Invalid token' };
  }

  if (invitation.status === 'submitted') {
    return { error: 'Already submitted' };
  }

  if (invitation.status === 'expired') {
    return { error: 'Invitation expired' };
  }

  // Check deadline
  if (invitation.deadline && new Date(invitation.deadline) < new Date('2026-01-01')) {
    return { error: 'Bid deadline has passed' };
  }

  // Check bid is active
  if (invitation.bid_status !== 'active') {
    return { error: 'Bid is not active' };
  }

  // Get vendor info
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(invitation.vendor_id) as any;

  // Create response
  const responseId = crypto.randomUUID();
  db.prepare('INSERT INTO vendor_responses (id, bid_id, vendor_name, vendor_id, pricing_mode) VALUES (?, ?, ?, ?, ?)')
    .run(responseId, invitation.bid_id, vendor.name, vendor.id, 'combination');

  for (const p of prices) {
    db.prepare('INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), responseId, p.combination_key, p.price);
  }

  // Update invitation status
  db.prepare("UPDATE bid_invitations SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?")
    .run(invitation.id);

  return { success: true, responseId };
}

describe('Vendor Submission via Token', () => {
  let db: Database.Database;
  let projectId: string;
  let bidId: string;
  let vendorId: string;

  beforeEach(() => {
    db = getTestDb();
    projectId = seedProject(db);
    bidId = seedBid(db, { project_id: projectId, status: 'active', deadline: '2027-12-31' });
    vendorId = seedVendor(db, { name: 'Submit Vendor', email: 'submit@test.com' });
  });

  describe('Valid submission', () => {
    it('should submit prices via valid token', () => {
      const { token } = seedBidInvitation(db, bidId, vendorId);
      const result = submitViaToken(db, token, [
        { combination_key: '{"Color":"Red"}', price: 100 },
        { combination_key: '{"Color":"Blue"}', price: 120 },
      ]);
      expect(result.success).toBe(true);
      expect(result.responseId).toBeTruthy();
    });

    it('should create a vendor_response linked to vendor_id', () => {
      const { token } = seedBidInvitation(db, bidId, vendorId);
      const result = submitViaToken(db, token, [
        { combination_key: '{"Color":"Red"}', price: 100 },
      ]);
      const response = db.prepare('SELECT * FROM vendor_responses WHERE id = ?').get(result.responseId!) as any;
      expect(response.vendor_id).toBe(vendorId);
      expect(response.vendor_name).toBe('Submit Vendor');
      expect(response.bid_id).toBe(bidId);
    });

    it('should store all prices', () => {
      const { token } = seedBidInvitation(db, bidId, vendorId);
      const result = submitViaToken(db, token, [
        { combination_key: '{"Color":"Red"}', price: 100 },
        { combination_key: '{"Color":"Blue"}', price: 120 },
        { combination_key: '{"Color":"Green"}', price: 110 },
      ]);
      const prices = db.prepare('SELECT * FROM vendor_prices WHERE response_id = ?').all(result.responseId!);
      expect(prices).toHaveLength(3);
    });

    it('should update invitation status to submitted', () => {
      const { id, token } = seedBidInvitation(db, bidId, vendorId);
      submitViaToken(db, token, [{ combination_key: 'k', price: 100 }]);
      const inv = db.prepare('SELECT * FROM bid_invitations WHERE id = ?').get(id) as any;
      expect(inv.status).toBe('submitted');
      expect(inv.submitted_at).toBeTruthy();
    });
  });

  describe('Rejection cases', () => {
    it('should reject invalid token', () => {
      const result = submitViaToken(db, 'bad-token', [{ combination_key: 'k', price: 100 }]);
      expect(result.error).toBe('Invalid token');
    });

    it('should reject duplicate submission', () => {
      const { token } = seedBidInvitation(db, bidId, vendorId, { status: 'submitted' });
      const result = submitViaToken(db, token, [{ combination_key: 'k', price: 100 }]);
      expect(result.error).toBe('Already submitted');
    });

    it('should reject expired invitation', () => {
      const { token } = seedBidInvitation(db, bidId, vendorId, { status: 'expired' });
      const result = submitViaToken(db, token, [{ combination_key: 'k', price: 100 }]);
      expect(result.error).toBe('Invitation expired');
    });

    it('should reject if bid is not active', () => {
      const draftBid = seedBid(db, { status: 'draft', project_id: projectId, deadline: '2027-12-31' });
      const { token } = seedBidInvitation(db, draftBid, vendorId);
      const result = submitViaToken(db, token, [{ combination_key: 'k', price: 100 }]);
      expect(result.error).toBe('Bid is not active');
    });

    it('should reject if bid deadline has passed', () => {
      const expiredBid = seedBid(db, { status: 'active', project_id: projectId, deadline: '2025-01-01' });
      const { token } = seedBidInvitation(db, expiredBid, vendorId);
      const result = submitViaToken(db, token, [{ combination_key: 'k', price: 100 }]);
      expect(result.error).toBe('Bid deadline has passed');
    });
  });
});
