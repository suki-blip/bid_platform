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
    `CREATE TABLE IF NOT EXISTS project_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      data BLOB NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS project_team (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      can_view_budget INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS team_member_projects (
      id TEXT PRIMARY KEY,
      team_member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS project_categories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES trade_categories(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS file_links (
      id TEXT PRIMARY KEY,
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      url TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS bid_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT REFERENCES trade_categories(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      parameters TEXT NOT NULL DEFAULT '[]',
      checklist TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS category_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_type TEXT,
      category_ids TEXT NOT NULL DEFAULT '[]',
      include_vendors INTEGER NOT NULL DEFAULT 0,
      vendor_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS vendor_proposals (
      id TEXT PRIMARY KEY,
      response_id TEXT NOT NULL REFERENCES vendor_responses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS vendor_proposal_specs (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES vendor_proposals(id) ON DELETE CASCADE,
      spec_key TEXT NOT NULL,
      spec_value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,

    // ===== FUNDRAISING MODULE =====
    // Each manager (saas_users.id) owns an isolated fundraising org.
    // Fundraisers are team_members with role='fundraiser'.
    // assigned_to = team_members.id (or NULL = manager-owned, no fundraiser assigned).

    `CREATE TABLE IF NOT EXISTS fr_projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      goal_amount REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'active',
      start_date TEXT,
      end_date TEXT,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS fr_sources (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS fr_donors (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      assigned_to TEXT REFERENCES team_members(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'prospect',
      first_name TEXT NOT NULL,
      last_name TEXT,
      hebrew_name TEXT,
      title TEXT,
      spouse_name TEXT,
      email TEXT,
      organization TEXT,
      occupation TEXT,
      birthday TEXT,
      yahrzeit TEXT,
      anniversary TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      source_id TEXT REFERENCES fr_sources(id) ON DELETE SET NULL,
      source_notes TEXT,
      preferred_contact TEXT,
      do_not_contact INTEGER NOT NULL DEFAULT 0,
      converted_at TEXT,
      total_pledged REAL NOT NULL DEFAULT 0,
      total_paid REAL NOT NULL DEFAULT 0,
      lifetime_value REAL NOT NULL DEFAULT 0,
      last_contact_at TEXT,
      next_followup_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS fr_donor_phones (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'mobile',
      phone TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS fr_donor_addresses (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'home',
      street TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      country TEXT,
      is_reception INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS fr_calls (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      fundraiser_id TEXT REFERENCES team_members(id) ON DELETE SET NULL,
      project_id TEXT REFERENCES fr_projects(id) ON DELETE SET NULL,
      direction TEXT NOT NULL DEFAULT 'outbound',
      channel TEXT NOT NULL DEFAULT 'phone',
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      duration_min INTEGER,
      outcome TEXT,
      summary TEXT,
      transcript TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS fr_pledges (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES fr_projects(id) ON DELETE SET NULL,
      fundraiser_id TEXT REFERENCES team_members(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'open',
      pledge_date TEXT NOT NULL DEFAULT (datetime('now')),
      due_date TEXT,
      installments_total INTEGER NOT NULL DEFAULT 1,
      payment_plan TEXT NOT NULL DEFAULT 'lump_sum',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS fr_pledge_payments (
      id TEXT PRIMARY KEY,
      pledge_id TEXT NOT NULL REFERENCES fr_pledges(id) ON DELETE CASCADE,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES fr_projects(id) ON DELETE SET NULL,
      installment_number INTEGER NOT NULL DEFAULT 1,
      method TEXT NOT NULL DEFAULT 'credit_card',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      due_date TEXT,
      paid_date TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      check_number TEXT,
      check_date TEXT,
      bank_name TEXT,
      cc_last4 TEXT,
      cc_holder TEXT,
      cc_expiry TEXT,
      transaction_ref TEXT,
      receipt_number TEXT,
      receipt_sent_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS fr_followups (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      donor_id TEXT REFERENCES fr_donors(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES fr_projects(id) ON DELETE SET NULL,
      fundraiser_id TEXT REFERENCES team_members(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_at TEXT NOT NULL,
      end_at TEXT,
      kind TEXT NOT NULL DEFAULT 'task',
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending',
      completed_at TEXT,
      hebrew_date TEXT,
      remind_minutes_before INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS fr_email_queue (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      donor_id TEXT REFERENCES fr_donors(id) ON DELETE SET NULL,
      project_id TEXT REFERENCES fr_projects(id) ON DELETE SET NULL,
      to_email TEXT NOT NULL,
      cc TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      send_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      sent_at TEXT,
      opened_at TEXT,
      delivered_at TEXT,
      bounced_at TEXT,
      error TEXT,
      provider_message_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS fr_notes (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      author_type TEXT NOT NULL DEFAULT 'manager',
      author_id TEXT,
      author_name TEXT,
      body TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS fr_donor_assignments (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      fundraiser_id TEXT REFERENCES team_members(id) ON DELETE SET NULL,
      assigned_by TEXT,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      reason TEXT
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
  try { await client.execute('ALTER TABLE projects ADD COLUMN owner_id TEXT REFERENCES saas_users(id) ON DELETE SET NULL'); } catch {}
  try { await client.execute('ALTER TABLE bids ADD COLUMN trade_category_id TEXT REFERENCES trade_categories(id) ON DELETE SET NULL'); } catch {}
  try { await client.execute("ALTER TABLE bid_parameters ADD COLUMN is_track INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { await client.execute("ALTER TABLE bid_winners ADD COLUMN winning_combination TEXT"); } catch {}
  try { await client.execute("ALTER TABLE bids ADD COLUMN checklist TEXT DEFAULT '[]'"); } catch {}
  try { await client.execute("ALTER TABLE bids ADD COLUMN allow_ve INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { await client.execute("ALTER TABLE vendor_responses ADD COLUMN checklist_answers TEXT DEFAULT '[]'"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN google_id TEXT"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN avatar_url TEXT"); } catch {}
  try { await client.execute("ALTER TABLE bids ADD COLUMN bid_mode TEXT NOT NULL DEFAULT 'structured'"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN notification_settings TEXT DEFAULT '{}'"); } catch {}
  try { await client.execute("ALTER TABLE vendor_responses ADD COLUMN notes TEXT"); } catch {}
  try { await client.execute("ALTER TABLE vendors ADD COLUMN rating INTEGER DEFAULT NULL"); } catch {}
  try { await client.execute("ALTER TABLE bids ADD COLUMN compare_settings TEXT DEFAULT '{}'"); } catch {}
  try { await client.execute("ALTER TABLE projects ADD COLUMN image_url TEXT"); } catch {}
  try { await client.execute("ALTER TABLE projects ADD COLUMN budget REAL DEFAULT NULL"); } catch {}
  try { await client.execute("ALTER TABLE projects ADD COLUMN budget_visible INTEGER DEFAULT 1"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN stripe_customer_id TEXT"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN stripe_subscription_id TEXT"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN trial_end_date TEXT"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN google_id TEXT"); } catch {}
  try { await client.execute("ALTER TABLE bid_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0"); } catch {}
  // Reminder dedup pointer — links scheduled emails back to the payment they remind about
  try { await client.execute('ALTER TABLE fr_email_queue ADD COLUMN payment_id TEXT'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_email_queue_payment ON fr_email_queue(payment_id)'); } catch {}

  // Free tier: lift the paywall — promote any pending users to active.
  try { await client.execute("UPDATE saas_users SET status = 'active' WHERE status = 'pending'"); } catch {}

  // Donor ratings: 1-5 (financial capacity = how wealthy; giving = how generous in practice).
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN financial_rating INTEGER'); } catch {}
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN giving_rating INTEGER'); } catch {}

  // Re-seed default templates in English (v2)
  try { await client.execute("DELETE FROM bid_templates WHERE is_default = 1"); } catch {}
  try { await client.execute(`CREATE TABLE IF NOT EXISTS vendor_response_files (
    id TEXT PRIMARY KEY,
    response_id TEXT NOT NULL REFERENCES vendor_responses(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    data BLOB NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`); } catch {}

  // Category-level budget
  try { await client.execute("ALTER TABLE project_categories ADD COLUMN budget REAL DEFAULT NULL"); } catch {}

  // Bid template enhancements
  try { await client.execute("ALTER TABLE bid_templates ADD COLUMN bid_mode TEXT NOT NULL DEFAULT 'structured'"); } catch {}
  try { await client.execute("ALTER TABLE bid_templates ADD COLUMN suggested_specs TEXT DEFAULT '[]'"); } catch {}

  // Open proposal suggested spec fields
  try { await client.execute("ALTER TABLE bids ADD COLUMN suggested_specs TEXT DEFAULT '[]'"); } catch {}

  // Vendor password reset columns
  try { await client.execute("ALTER TABLE vendors ADD COLUMN reset_token TEXT"); } catch {}
  try { await client.execute("ALTER TABLE vendors ADD COLUMN reset_token_expires TEXT"); } catch {}

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

  // Seed default bid templates per trade category
  const defaultTemplates: [string, string, string, { name: string; options: string[]; is_track?: boolean }[], string[]][] = [
    // [category_id, name, description, parameters, checklist]
    ['general-construction', 'General Construction Bid', 'Price quote for general construction works',
      [
        { name: 'Scope of Work', options: ['Shell Only', 'Finishes Only', 'Shell + Finishes'] },
        { name: 'Area (sqm)', options: ['Up to 100', '100-300', '300-500', 'Over 500'] },
        { name: 'Floors', options: ['1', '2-3', '4-6', 'Over 6'] },
        { name: 'Timeline', options: ['Up to 3 months', '3-6 months', '6-12 months', 'Over 1 year'] },
      ],
      ['Licensed contractor certificate', 'Third-party liability insurance', 'Detailed schedule', 'Subcontractor list']],

    ['concrete', 'Concrete Works Bid', 'Price quote for concrete works',
      [
        { name: 'Concrete Grade', options: ['B-20', 'B-25', 'B-30', 'B-40', 'B-50'] },
        { name: 'Work Type', options: ['Foundations', 'Beams', 'Slabs', 'Columns', 'Walls', 'General'] },
        { name: 'Includes Rebar', options: ['Yes', 'No'] },
        { name: 'Includes Formwork', options: ['Yes', 'No'] },
        { name: 'Site Access', options: ['Easy', 'Limited', 'Difficult'] },
      ],
      ['Concrete lab certification', 'Insurance', 'Pouring plan']],

    ['structural-steel', 'Structural Steel Bid', 'Price quote for structural steel works',
      [
        { name: 'Steel Grade', options: ['S235', 'S275', 'S355', 'Stainless Steel'] },
        { name: 'Work Type', options: ['Frame', 'Railings', 'Stairs', 'Canopy', 'Pergola', 'Other'] },
        { name: 'Includes Installation', options: ['Yes', 'No'] },
        { name: 'Coating/Finish', options: ['Epoxy Paint', 'Hot-Dip Galvanized', 'Powder Coated', 'None'] },
        { name: 'Estimated Weight (tons)', options: ['Up to 5', '5-20', '20-50', 'Over 50'] },
      ],
      ['Detailed drawings', 'Engineer approval', 'Insurance']],

    ['masonry', 'Masonry Bid', 'Price quote for masonry and block works',
      [
        { name: 'Block Type', options: ['Block 10cm', 'Block 15cm', 'Block 20cm', 'Block 25cm', 'AAC', 'Silicate'] },
        { name: 'Work Type', options: ['Exterior Walls', 'Interior Walls', 'Partitions', 'Fences'] },
        { name: 'Height (m)', options: ['Up to 3', '3-6', '6-10', 'Over 10'] },
        { name: 'Includes Plaster', options: ['Yes', 'No'] },
      ],
      ['Contractor license', 'Insurance']],

    ['carpentry', 'Carpentry Bid', 'Price quote for carpentry works',
      [
        { name: 'Wood Type', options: ['Pine', 'Oak', 'MDF', 'Plywood', 'Birch', 'Other'] },
        { name: 'Work Type', options: ['Kitchen Cabinets', 'Bathroom Vanities', 'Doors', 'Wall Cladding', 'Custom Furniture', 'Other'] },
        { name: 'Finish', options: ['Lacquer', 'Paint', 'Veneer', 'Laminate', 'HPL'] },
        { name: 'Includes Installation', options: ['Yes', 'No'] },
      ],
      ['Drawings/Plans', 'Material samples', 'Warranty']],

    ['roofing', 'Roofing Bid', 'Price quote for roofing works',
      [
        { name: 'Roof Type', options: ['Tiles', 'Insulated Panel', 'Metal Sheet', 'Bituminous', 'Membrane', 'Green Roof'] },
        { name: 'Area (sqm)', options: ['Up to 100', '100-300', '300-500', 'Over 500'] },
        { name: 'Includes Insulation', options: ['Yes - Thermal', 'Yes - Acoustic', 'Yes - Both', 'No'] },
        { name: 'Includes Gutters', options: ['Yes', 'No'] },
        { name: 'Slope', options: ['Flat', 'Pitched', 'Curved'] },
      ],
      ['Waterproofing warranty', 'Insurance', 'Execution plan']],

    ['waterproofing', 'Waterproofing Bid', 'Price quote for waterproofing works',
      [
        { name: 'Waterproofing Type', options: ['Bituminous', 'PVC Membrane', 'Polyurethane', 'Epoxy', 'Silicone', 'Cementitious'] },
        { name: 'Location', options: ['Roof', 'Basement', 'Shower', 'Pool', 'Parking', 'Exterior Walls'] },
        { name: 'Area (sqm)', options: ['Up to 50', '50-200', '200-500', 'Over 500'] },
        { name: 'Layers', options: ['Single Layer', 'Two Layers', 'Three Layers'] },
      ],
      ['Warranty (years)', 'Waterproofing plan', 'Material sample']],

    ['plumbing', 'Plumbing Bid', 'Price quote for plumbing works',
      [
        { name: 'Work Type', options: ['New System', 'Renovation/Replacement', 'Repair', 'Extension'] },
        { name: 'Pipe Type', options: ['PVC', 'PPR', 'Copper', 'Steel', 'PEX'] },
        { name: 'Includes Sanitary Fixtures', options: ['Yes', 'No'] },
        { name: 'Water Points', options: ['Up to 10', '10-30', '30-60', 'Over 60'] },
        { name: 'Includes Solar Heater', options: ['Yes', 'No'] },
      ],
      ['Plumbing plan', 'Licensed plumber certificate', 'Warranty']],

    ['hvac', 'HVAC Bid', 'Price quote for HVAC systems',
      [
        { name: 'System Type', options: ['Mini Central', 'VRF/VRV', 'Split', 'Chiller', 'Central'] },
        { name: 'Capacity (tons)', options: ['Up to 5', '5-15', '15-30', '30-60', 'Over 60'] },
        { name: 'Includes Ductwork', options: ['Yes', 'No'] },
        { name: 'Controls', options: ['Standard Remote', 'Central Control', 'BMS'] },
        { name: 'Energy Rating', options: ['Standard', 'A', 'A+', 'A++'] },
      ],
      ['HVAC plan', 'Cooling load calculation', 'Manufacturer warranty', 'Maintenance service']],

    ['electrical', 'Electrical Bid', 'Price quote for electrical works',
      [
        { name: 'Work Type', options: ['New System', 'Renovation', 'Extension', 'Repair'] },
        { name: 'Power Supply', options: ['Single Phase', 'Three Phase'] },
        { name: 'Electrical Points', options: ['Up to 20', '20-50', '50-100', 'Over 100'] },
        { name: 'Panel Type', options: ['Residential', 'Commercial', 'Industrial'] },
        { name: 'Includes Lighting', options: ['Yes - LED', 'Yes - Standard', 'No'] },
      ],
      ['Licensed electrician certificate', 'Electrical plan', 'Standards institute inspection']],

    ['fire-protection', 'Fire Protection Bid', 'Price quote for fire protection systems',
      [
        { name: 'System Type', options: ['Sprinklers', 'Smoke Detection', 'Gas Suppression', 'Dry Standpipe', 'Combined'] },
        { name: 'Area (sqm)', options: ['Up to 200', '200-500', '500-1000', 'Over 1000'] },
        { name: 'Building Class', options: ['Residential', 'Office', 'Commercial', 'Industrial', 'Public'] },
        { name: 'Includes Fire Dept. Approval', options: ['Yes', 'No'] },
      ],
      ['Fire department approval', 'Fire suppression plan', 'Warranty', 'Maintenance contract']],

    ['low-voltage', 'Low Voltage Bid', 'Price quote for low voltage systems',
      [
        { name: 'System Type', options: ['Data Network', 'Telephony', 'Intercom', 'CCTV', 'Alarm', 'Access Control', 'Combined'] },
        { name: 'Points', options: ['Up to 20', '20-50', '50-100', 'Over 100'] },
        { name: 'Includes Network Cabinet', options: ['Yes', 'No'] },
        { name: 'Includes Materials', options: ['Yes', 'No'] },
      ],
      ['Network plan', 'Warranty', 'Maintenance service']],

    ['elevator', 'Elevator Bid', 'Price quote for elevators',
      [
        { name: 'Elevator Type', options: ['Passenger', 'Freight', 'Sabbath', 'Accessibility', 'Panoramic'] },
        { name: 'Floors', options: ['2-3', '4-6', '7-10', 'Over 10'] },
        { name: 'Stops', options: ['2-4', '5-8', '9-12', 'Over 12'] },
        { name: 'Capacity (kg)', options: ['450', '630', '1000', '1600', '2500'] },
        { name: 'Speed (m/s)', options: ['1.0', '1.6', '2.0', '2.5'] },
      ],
      ['Standards institute approval', 'Annual maintenance contract', 'Manufacturer warranty', 'Lead time']],

    ['painting', 'Painting Bid', 'Price quote for painting works',
      [
        { name: 'Paint Type', options: ['Acrylic', 'Oil-Based', 'Epoxy', 'Silicone', 'Lime'] },
        { name: 'Location', options: ['Interior', 'Exterior', 'Interior + Exterior'] },
        { name: 'Coats', options: ['One Coat', 'Two Coats', 'Three Coats'] },
        { name: 'Includes Surface Prep', options: ['Yes - Spackle', 'Yes - Primer', 'Yes - Full', 'No'] },
        { name: 'Area (sqm)', options: ['Up to 100', '100-300', '300-600', 'Over 600'] },
      ],
      ['Color samples', 'Warranty']],

    ['flooring', 'Flooring Bid', 'Price quote for flooring works',
      [
        { name: 'Flooring Type', options: ['Porcelain', 'Marble', 'Granite', 'Hardwood', 'Laminate', 'Vinyl', 'Epoxy', 'Polished Concrete'] },
        { name: 'Area (sqm)', options: ['Up to 50', '50-150', '150-300', 'Over 300'] },
        { name: 'Includes Materials', options: ['Yes', 'No'] },
        { name: 'Includes Adhesive', options: ['Yes', 'No'] },
        { name: 'Laying Pattern', options: ['Straight', 'Diagonal', 'Herringbone', 'Parquet', 'Free'] },
      ],
      ['Material samples', 'Warranty']],

    ['tile', 'Tile Bid', 'Price quote for tile and cladding works',
      [
        { name: 'Tile Type', options: ['Ceramic', 'Porcelain', 'Marble', 'Mosaic', 'Natural Stone'] },
        { name: 'Location', options: ['Floor', 'Walls', 'Shower', 'Kitchen', 'Exterior'] },
        { name: 'Tile Size', options: ['Small (up to 30x30)', 'Medium (60x60)', 'Large (80x80+)', 'Mixed'] },
        { name: 'Includes Materials', options: ['Yes', 'No'] },
      ],
      ['Samples', 'Workmanship warranty']],

    ['drywall', 'Drywall Bid', 'Price quote for drywall works',
      [
        { name: 'Board Type', options: ['Standard', 'Moisture Resistant', 'Fire Resistant', 'Acoustic'] },
        { name: 'Work Type', options: ['Ceiling', 'Partitions', 'Wall Cladding', 'Design Elements', 'Combined'] },
        { name: 'Layers', options: ['Single Layer', 'Double Layer'] },
        { name: 'Includes Framing', options: ['Yes', 'No'] },
        { name: 'Includes Finishing', options: ['Q2', 'Q3', 'Q4', 'No'] },
      ],
      ['Ceiling plan', 'Warranty']],

    ['millwork', 'Millwork Bid', 'Price quote for millwork and custom joinery',
      [
        { name: 'Work Type', options: ['Panels', 'Shelving', 'Cabinets', 'Counters', 'Cladding', 'Other'] },
        { name: 'Material', options: ['Solid Wood', 'MDF', 'Veneer', 'HPL', 'Corian', 'Mixed'] },
        { name: 'Finish', options: ['Matte Lacquer', 'Gloss Lacquer', 'Paint', 'Veneer', 'Natural'] },
        { name: 'Includes Installation', options: ['Yes', 'No'] },
      ],
      ['Detailed drawings', 'Material samples', 'Warranty']],

    ['glass---glazing', 'Glass & Glazing Bid', 'Price quote for glass and aluminum works',
      [
        { name: 'Work Type', options: ['Windows', 'Doors', 'Railings', 'Curtain Wall', 'Partitions', 'Shower Enclosures'] },
        { name: 'Glass Type', options: ['Standard', 'Tempered', 'Laminated', 'Double Glazed', 'Triple Glazed'] },
        { name: 'Frame Material', options: ['Aluminum', 'PVC', 'Steel', 'Frameless'] },
        { name: 'Frame Color', options: ['White', 'Black', 'Anthracite', 'Brown', 'Custom RAL'] },
      ],
      ['Window schedule', 'Weatherproofing warranty', 'Standards certification']],

    ['doors---hardware', 'Doors & Hardware Bid', 'Price quote for doors and hardware',
      [
        { name: 'Door Type', options: ['Interior', 'Entry', 'Fire-Rated', 'Sliding', 'Folding', 'Exterior'] },
        { name: 'Material', options: ['Solid Wood', 'HDF', 'Aluminum', 'Steel', 'Glass'] },
        { name: 'Includes Frame', options: ['Yes', 'No'] },
        { name: 'Includes Hardware', options: ['Yes - Standard', 'Yes - Premium', 'No'] },
        { name: 'Includes Installation', options: ['Yes', 'No'] },
      ],
      ['Samples', 'Warranty', 'Lead time']],

    ['kitchen-equipment', 'Kitchen Equipment Bid', 'Price quote for kitchen equipment',
      [
        { name: 'Kitchen Type', options: ['Residential', 'Commercial/Institutional', 'Industrial'] },
        { name: 'Includes Cabinets', options: ['Yes', 'No'] },
        { name: 'Includes Countertop', options: ['Marble', 'Corian', 'Granite', 'Stainless Steel', 'No'] },
        { name: 'Includes Appliances', options: ['Yes', 'No'] },
        { name: 'Includes Installation', options: ['Yes', 'No'] },
      ],
      ['Kitchen layout drawing', 'Appliance specifications', 'Warranty']],

    ['demolition', 'Demolition Bid', 'Price quote for demolition works',
      [
        { name: 'Demolition Type', options: ['Full', 'Partial', 'Interior Only', 'Careful Dismantling'] },
        { name: 'Structure Type', options: ['Concrete', 'Block', 'Steel', 'Wood', 'Mixed'] },
        { name: 'Area (sqm)', options: ['Up to 100', '100-300', '300-600', 'Over 600'] },
        { name: 'Includes Waste Removal', options: ['Yes', 'No'] },
        { name: 'Includes Recycling', options: ['Yes', 'No'] },
      ],
      ['Demolition permit', 'Insurance', 'Safety plan', 'Environmental approval']],

    ['excavation', 'Excavation Bid', 'Price quote for excavation and earthworks',
      [
        { name: 'Work Type', options: ['Excavation', 'Fill', 'Shoring', 'Drainage', 'Grading'] },
        { name: 'Volume (cum)', options: ['Up to 100', '100-500', '500-2000', 'Over 2000'] },
        { name: 'Soil Type', options: ['Sand', 'Clay', 'Rock', 'Mixed'] },
        { name: 'Includes Hauling', options: ['Yes', 'No'] },
        { name: 'Depth (m)', options: ['Up to 2', '2-5', '5-10', 'Over 10'] },
      ],
      ['Geotechnical engineer approval', 'Insurance', 'Excavation plan']],

    ['landscaping', 'Landscaping Bid', 'Price quote for landscaping and site development',
      [
        { name: 'Work Type', options: ['Planting', 'Irrigation', 'Garden Lighting', 'Fencing', 'Decking', 'Combined'] },
        { name: 'Area (sqm)', options: ['Up to 100', '100-500', '500-1000', 'Over 1000'] },
        { name: 'Includes Plants', options: ['Yes', 'No'] },
        { name: 'Includes Irrigation System', options: ['Drip', 'Sprinkler', 'Combined', 'No'] },
      ],
      ['Landscape plan', 'Plant list', 'Warranty']],

    ['paving', 'Paving Bid', 'Price quote for exterior paving and surfacing',
      [
        { name: 'Paving Type', options: ['Interlocking Pavers', 'Asphalt', 'Concrete', 'Natural Stone', 'Deck'] },
        { name: 'Area (sqm)', options: ['Up to 100', '100-300', '300-600', 'Over 600'] },
        { name: 'Includes Base Prep', options: ['Yes - Sub-base + Compaction', 'Yes - Concrete', 'No'] },
        { name: 'Includes Curbing', options: ['Yes', 'No'] },
        { name: 'Drainage', options: ['Yes', 'No'] },
      ],
      ['Paving plan', 'Warranty']],
  ];

  for (const [catId, name, desc, params, checklist] of defaultTemplates) {
    try {
      await client.execute({
        sql: 'INSERT OR IGNORE INTO bid_templates (id, name, category_id, title, description, parameters, checklist, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        args: [
          `default-${catId}`,
          name,
          catId,
          name,
          desc,
          JSON.stringify(params),
          JSON.stringify(checklist),
        ],
      });
    } catch {}
  }

  // ===== FUNDRAISING INDEXES =====
  const fundraisingIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_fr_donors_owner ON fr_donors(owner_id)',
    'CREATE INDEX IF NOT EXISTS idx_fr_donors_assigned ON fr_donors(assigned_to)',
    'CREATE INDEX IF NOT EXISTS idx_fr_donors_status ON fr_donors(owner_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_fr_calls_donor ON fr_calls(donor_id, occurred_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_fr_calls_owner ON fr_calls(owner_id, occurred_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_fr_pledges_donor ON fr_pledges(donor_id)',
    'CREATE INDEX IF NOT EXISTS idx_fr_pledges_owner ON fr_pledges(owner_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_fr_pledges_project ON fr_pledges(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_fr_payments_pledge ON fr_pledge_payments(pledge_id)',
    'CREATE INDEX IF NOT EXISTS idx_fr_payments_status ON fr_pledge_payments(status, due_date)',
    'CREATE INDEX IF NOT EXISTS idx_fr_payments_donor ON fr_pledge_payments(donor_id, paid_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_fr_followups_owner_due ON fr_followups(owner_id, due_at)',
    'CREATE INDEX IF NOT EXISTS idx_fr_followups_fundraiser ON fr_followups(fundraiser_id, due_at)',
    'CREATE INDEX IF NOT EXISTS idx_fr_followups_donor ON fr_followups(donor_id, due_at)',
    'CREATE INDEX IF NOT EXISTS idx_fr_email_queue_send ON fr_email_queue(status, send_at)',
    'CREATE INDEX IF NOT EXISTS idx_fr_email_queue_owner ON fr_email_queue(owner_id, send_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_fr_notes_donor ON fr_notes(donor_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_fr_phones_donor ON fr_donor_phones(donor_id)',
    'CREATE INDEX IF NOT EXISTS idx_fr_addresses_donor ON fr_donor_addresses(donor_id)',
    'CREATE INDEX IF NOT EXISTS idx_fr_projects_owner ON fr_projects(owner_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_fr_sources_owner ON fr_sources(owner_id)',
  ];
  for (const sql of fundraisingIndexes) {
    try { await client.execute(sql); } catch {}
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
