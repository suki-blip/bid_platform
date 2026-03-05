import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'bids.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS bids (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    deadline TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bid_parameters (
    id TEXT PRIMARY KEY,
    bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bid_parameter_options (
    id TEXT PRIMARY KEY,
    parameter_id TEXT NOT NULL REFERENCES bid_parameters(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bid_files (
    id TEXT PRIMARY KEY,
    bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    data BLOB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vendor_responses (
    id TEXT PRIMARY KEY,
    bid_id TEXT NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    vendor_name TEXT NOT NULL,
    pricing_mode TEXT NOT NULL DEFAULT 'combination',
    base_price REAL,
    rules TEXT,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vendor_prices (
    id TEXT PRIMARY KEY,
    response_id TEXT NOT NULL REFERENCES vendor_responses(id) ON DELETE CASCADE,
    combination_key TEXT NOT NULL,
    price REAL NOT NULL
  );
`);

// Migrate: add columns if missing
try {
  db.exec(`ALTER TABLE vendor_responses ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'combination'`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE vendor_responses ADD COLUMN base_price REAL`);
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE vendor_responses ADD COLUMN rules TEXT`);
} catch { /* column already exists */ }

export default db;
