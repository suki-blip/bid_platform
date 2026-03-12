import Database from 'better-sqlite3';

export function getTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      type TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE bids (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE bid_parameters (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE bid_parameter_options (
      id TEXT PRIMARY KEY,
      parameter_id TEXT NOT NULL REFERENCES bid_parameters(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE bid_files (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      data BLOB NOT NULL
    );

    CREATE TABLE trade_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      grp TEXT NOT NULL DEFAULT 'Other',
      is_custom INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      cc_emails TEXT,
      phone TEXT,
      contact_person TEXT,
      trade_category TEXT REFERENCES trade_categories(id) ON DELETE SET NULL,
      website TEXT,
      license TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE bid_invitations (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      opened_at TEXT,
      submitted_at TEXT
    );

    CREATE TABLE vendor_responses (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      vendor_name TEXT NOT NULL,
      vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
      pricing_mode TEXT NOT NULL DEFAULT 'combination',
      base_price REAL,
      rules TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE vendor_prices (
      id TEXT PRIMARY KEY,
      response_id TEXT NOT NULL REFERENCES vendor_responses(id) ON DELETE CASCADE,
      combination_key TEXT NOT NULL,
      price REAL NOT NULL
    );

    CREATE TABLE bid_winners (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL UNIQUE REFERENCES bids(id) ON DELETE CASCADE,
      vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      vendor_response_id TEXT NOT NULL REFERENCES vendor_responses(id) ON DELETE CASCADE,
      notes TEXT,
      selected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE reminder_log (
      id TEXT PRIMARY KEY,
      bid_invitation_id TEXT NOT NULL REFERENCES bid_invitations(id) ON DELETE CASCADE,
      reminder_type TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE saas_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'trial',
      payment TEXT NOT NULL DEFAULT 'trial',
      plan TEXT NOT NULL DEFAULT 'Trial',
      joined TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      date TEXT NOT NULL DEFAULT (datetime('now')),
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid'
    );

    CREATE TABLE activity_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE admin_messages (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      recipients_filter TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

export function cleanupTestDb() {
  // No-op for in-memory databases — they're garbage collected automatically
}

export function seedProject(db: Database.Database, overrides: Partial<{
  id: string;
  name: string;
  address: string;
  type: string;
  description: string;
  status: string;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  const name = overrides.name || 'Test Project';
  db.prepare('INSERT INTO projects (id, name, address, type, description, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, overrides.address || null, overrides.type || null, overrides.description || null, overrides.status || 'active');
  return id;
}

export function seedBid(db: Database.Database, overrides: Partial<{
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: string;
  project_id: string | null;
  parameters: { name: string; options: string[] }[];
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  const title = overrides.title || 'Test Bid';
  const description = overrides.description || 'Test description';
  const deadline = overrides.deadline || '2026-12-31';
  const status = overrides.status || 'draft';
  const project_id = overrides.project_id ?? null;
  const parameters = overrides.parameters || [
    { name: 'Color', options: ['Red', 'Blue'] },
    { name: 'Size', options: ['S', 'M', 'L'] },
  ];

  db.prepare('INSERT INTO bids (id, title, description, deadline, status, project_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, title, description, deadline, status, project_id);

  for (let i = 0; i < parameters.length; i++) {
    const paramId = crypto.randomUUID();
    db.prepare('INSERT INTO bid_parameters (id, bid_id, name, sort_order) VALUES (?, ?, ?, ?)').run(paramId, id, parameters[i].name, i);

    for (let j = 0; j < parameters[i].options.length; j++) {
      const optionId = crypto.randomUUID();
      db.prepare('INSERT INTO bid_parameter_options (id, parameter_id, value, sort_order) VALUES (?, ?, ?, ?)').run(optionId, paramId, parameters[i].options[j], j);
    }
  }

  return id;
}

export function seedCombinationResponse(db: Database.Database, bidId: string, overrides: Partial<{
  vendorName: string;
  prices: { combination_key: string; price: number }[];
}> = {}) {
  const responseId = crypto.randomUUID();
  const vendorName = overrides.vendorName || 'Test Vendor';

  db.prepare('INSERT INTO vendor_responses (id, bid_id, vendor_name, pricing_mode) VALUES (?, ?, ?, ?)').run(responseId, bidId, vendorName, 'combination');

  const prices = overrides.prices || [
    { combination_key: '{"Color":"Red","Size":"S"}', price: 100 },
    { combination_key: '{"Color":"Red","Size":"M"}', price: 120 },
    { combination_key: '{"Color":"Blue","Size":"S"}', price: 110 },
  ];

  for (const p of prices) {
    db.prepare('INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), responseId, p.combination_key, p.price);
  }

  return responseId;
}

export function seedTradeCategory(db: Database.Database, overrides: Partial<{
  id: string;
  name: string;
  grp: string;
  is_custom: number;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  const name = overrides.name || 'Plumbing';
  db.prepare('INSERT INTO trade_categories (id, name, grp, is_custom) VALUES (?, ?, ?, ?)')
    .run(id, name, overrides.grp || 'MEP', overrides.is_custom ?? 0);
  return id;
}

export function seedVendor(db: Database.Database, overrides: Partial<{
  id: string;
  name: string;
  email: string;
  cc_emails: string;
  phone: string;
  contact_person: string;
  trade_category: string | null;
  website: string;
  license: string;
  notes: string;
  status: string;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  const name = overrides.name || 'Test Vendor Co';
  const email = overrides.email || `vendor-${id.slice(0, 8)}@test.com`;
  db.prepare('INSERT INTO vendors (id, name, email, cc_emails, phone, contact_person, trade_category, website, license, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, email, overrides.cc_emails || null, overrides.phone || null, overrides.contact_person || null, overrides.trade_category ?? null, overrides.website || null, overrides.license || null, overrides.notes || null, overrides.status || 'active');
  return id;
}

export function seedBidInvitation(db: Database.Database, bidId: string, vendorId: string, overrides: Partial<{
  id: string;
  token: string;
  status: string;
  opened_at: string | null;
  submitted_at: string | null;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  const token = overrides.token || crypto.randomUUID();
  db.prepare('INSERT INTO bid_invitations (id, bid_id, vendor_id, token, status, opened_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, bidId, vendorId, token, overrides.status || 'pending', overrides.opened_at || null, overrides.submitted_at || null);
  return { id, token };
}

export function seedVendorResponse(db: Database.Database, bidId: string, vendorId: string, overrides: Partial<{
  id: string;
  vendorName: string;
  prices: { combination_key: string; price: number }[];
}> = {}) {
  const responseId = overrides.id || crypto.randomUUID();
  const vendorName = overrides.vendorName || 'Test Vendor';
  db.prepare('INSERT INTO vendor_responses (id, bid_id, vendor_name, vendor_id, pricing_mode) VALUES (?, ?, ?, ?, ?)')
    .run(responseId, bidId, vendorName, vendorId, 'combination');
  const prices = overrides.prices || [
    { combination_key: '{"Color":"Red","Size":"S"}', price: 100 },
  ];
  for (const p of prices) {
    db.prepare('INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), responseId, p.combination_key, p.price);
  }
  return responseId;
}

export function seedBidWinner(db: Database.Database, bidId: string, vendorId: string, vendorResponseId: string, overrides: Partial<{
  id: string;
  notes: string;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  db.prepare('INSERT INTO bid_winners (id, bid_id, vendor_id, vendor_response_id, notes) VALUES (?, ?, ?, ?, ?)')
    .run(id, bidId, vendorId, vendorResponseId, overrides.notes || null);
  return id;
}

// Pre-computed hash of "password123" for test speed
const TEST_PASSWORD_HASH = 'testhash:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export function seedSaasUser(db: Database.Database, overrides: Partial<{
  id: string;
  name: string;
  company: string;
  email: string;
  password_hash: string;
  status: string;
  payment: string;
  plan: string;
  joined: string;
  last_login: string;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  const email = overrides.email || `user-${id.slice(0, 8)}@test.com`;
  db.prepare('INSERT INTO saas_users (id, name, company, email, password_hash, status, payment, plan, joined, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, overrides.name || 'Test User', overrides.company || 'Test Co', email,
      overrides.password_hash || TEST_PASSWORD_HASH,
      overrides.status || 'active', overrides.payment || 'paid', overrides.plan || 'Pro',
      overrides.joined || datetime('now'), overrides.last_login || null);
  return id;
}

export function seedPayment(db: Database.Database, userId: string, overrides: Partial<{
  id: string;
  date: string;
  amount: number;
  status: string;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  db.prepare('INSERT INTO payments (id, user_id, date, amount, status) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, overrides.date || datetime('now'), overrides.amount ?? 199, overrides.status || 'paid');
  return id;
}

export function seedActivityLog(db: Database.Database, overrides: Partial<{
  id: string;
  type: string;
  text: string;
  created_at: string;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  db.prepare('INSERT INTO activity_log (id, type, text, created_at) VALUES (?, ?, ?, ?)')
    .run(id, overrides.type || 'admin', overrides.text || 'Test activity', overrides.created_at || datetime('now'));
  return id;
}

export function seedAdminMessage(db: Database.Database, overrides: Partial<{
  id: string;
  subject: string;
  body: string;
  recipients_filter: string;
  recipient_count: number;
  sent_at: string;
}> = {}) {
  const id = overrides.id || crypto.randomUUID();
  db.prepare('INSERT INTO admin_messages (id, subject, body, recipients_filter, recipient_count, sent_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, overrides.subject || 'Test Subject', overrides.body || 'Test body',
      overrides.recipients_filter || '{"type":"all"}', overrides.recipient_count ?? 0,
      overrides.sent_at || datetime('now'));
  return id;
}

export function seedAdminSetting(db: Database.Database, key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)').run(key, value);
}

function datetime(_now: string) {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function seedAdditiveResponse(db: Database.Database, bidId: string, overrides: Partial<{
  vendorName: string;
  basePrice: number;
  prices: { combination_key: string; price: number }[];
  rules: any[];
}> = {}) {
  const responseId = crypto.randomUUID();
  const vendorName = overrides.vendorName || 'Additive Vendor';
  const basePrice = overrides.basePrice ?? 100;
  const rules = overrides.rules || [];

  db.prepare('INSERT INTO vendor_responses (id, bid_id, vendor_name, pricing_mode, base_price, rules) VALUES (?, ?, ?, ?, ?, ?)').run(
    responseId, bidId, vendorName, 'additive', basePrice, JSON.stringify(rules)
  );

  const prices = overrides.prices || [
    { combination_key: '{"param":"Color","option":"Red"}', price: 10 },
    { combination_key: '{"param":"Color","option":"Blue"}', price: 20 },
    { combination_key: '{"param":"Size","option":"S"}', price: 0 },
    { combination_key: '{"param":"Size","option":"M"}', price: 15 },
    { combination_key: '{"param":"Size","option":"L"}', price: 30 },
  ];

  for (const p of prices) {
    db.prepare('INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), responseId, p.combination_key, p.price);
  }

  return responseId;
}
