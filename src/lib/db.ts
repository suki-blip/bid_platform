import { createClient, type Client } from '@libsql/client';

let _db: Client | null = null;
let _dbReady: Promise<void> | null = null;

function getClient(): Client {
  if (!_db) {
    _db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _db;
}

async function initializeDatabase() {
  const client = getClient();
  try { await client.execute('PRAGMA foreign_keys = ON'); } catch {}

  const tables = [
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      type TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS bid_parameters (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS bid_parameter_options (
      id TEXT PRIMARY KEY,
      parameter_id TEXT NOT NULL REFERENCES bid_parameters(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS bid_files (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      data BLOB NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS trade_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      grp TEXT NOT NULL DEFAULT 'Other',
      is_custom INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS vendors (
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
    )`,
    `CREATE TABLE IF NOT EXISTS bid_invitations (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      opened_at TEXT,
      submitted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS vendor_responses (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
      vendor_name TEXT NOT NULL,
      vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL,
      pricing_mode TEXT NOT NULL DEFAULT 'combination',
      base_price REAL,
      rules TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS vendor_prices (
      id TEXT PRIMARY KEY,
      response_id TEXT NOT NULL REFERENCES vendor_responses(id) ON DELETE CASCADE,
      combination_key TEXT NOT NULL,
      price REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS bid_winners (
      id TEXT PRIMARY KEY,
      bid_id TEXT NOT NULL UNIQUE REFERENCES bids(id) ON DELETE CASCADE,
      vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      vendor_response_id TEXT NOT NULL REFERENCES vendor_responses(id) ON DELETE CASCADE,
      notes TEXT,
      selected_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS reminder_log (
      id TEXT PRIMARY KEY,
      bid_invitation_id TEXT NOT NULL REFERENCES bid_invitations(id) ON DELETE CASCADE,
      reminder_type TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS saas_users (
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
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      date TEXT NOT NULL DEFAULT (datetime('now')),
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid'
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS admin_messages (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      recipients_filter TEXT NOT NULL,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  ];

  // Run each CREATE TABLE individually to avoid batch failures on existing schemas
  for (const sql of tables) {
    try { await client.execute(sql); } catch {}
  }

  // Migrations for existing databases
  try { await client.execute('ALTER TABLE bids ADD COLUMN status TEXT NOT NULL DEFAULT \'draft\''); } catch {}
  try { await client.execute('ALTER TABLE bids ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL'); } catch {}
  try { await client.execute('ALTER TABLE vendor_responses ADD COLUMN vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL'); } catch {}
  try { await client.execute('ALTER TABLE vendors ADD COLUMN password_hash TEXT'); } catch {}

  // Seed default trade categories
  const defaultCategories = [
    ['General Construction', 'Structure'], ['Concrete', 'Structure'], ['Structural Steel', 'Structure'],
    ['Masonry', 'Structure'], ['Carpentry', 'Structure'], ['Roofing', 'Structure'], ['Waterproofing', 'Structure'],
    ['Plumbing', 'MEP'], ['HVAC', 'MEP'], ['Electrical', 'MEP'],
    ['Fire Protection', 'MEP'], ['Low Voltage', 'MEP'], ['Elevator', 'MEP'],
    ['Painting', 'Finishes'], ['Flooring', 'Finishes'], ['Tile', 'Finishes'], ['Drywall', 'Finishes'],
    ['Millwork', 'Finishes'], ['Glass & Glazing', 'Finishes'], ['Doors & Hardware', 'Finishes'], ['Kitchen Equipment', 'Finishes'],
    ['Demolition', 'Site'], ['Excavation', 'Site'], ['Landscaping', 'Site'], ['Paving', 'Site'],
  ];
  for (const [name, grp] of defaultCategories) {
    try {
      await client.execute({
        sql: 'INSERT OR IGNORE INTO trade_categories (id, name, grp, is_custom) VALUES (?, ?, ?, 0)',
        args: [name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, grp],
      });
    } catch {}
  }

  // Seed default admin settings
  const defaultSettings = [
    ['admin_email', 'admin@bidmaster.app'],
    ['notification_email', 'admin@bidmaster.app'],
    ['auto_suspend_days', '14'],
    ['auto_reminder_days', '3'],
  ];
  for (const [key, value] of defaultSettings) {
    try {
      await client.execute({
        sql: 'INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)',
        args: [key, value],
      });
    } catch {}
  }
}

function ensureDbReady(): Promise<void> {
  if (!_dbReady) {
    _dbReady = initializeDatabase().catch(console.error) as Promise<void>;
  }
  return _dbReady;
}

// Export getClient as db() — must be called as a function, not used as a value,
// to avoid Proxy issues with private class members on Vercel's runtime.
const db = getClient;
const dbReady = ensureDbReady;

export { db, dbReady };
