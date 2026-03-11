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

    CREATE TABLE vendor_responses (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      vendor_name TEXT NOT NULL,
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
