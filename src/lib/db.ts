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

  // Shared tables + fundraising + dialer.
  //
  // BidMaster was fully retired from this repo on 2026-11-01 — all its CREATE/ALTER
  // migrations were removed. Existing production databases still have the old BidMaster
  // tables sitting there; dropping them is a separate manual step we don't want to do
  // automatically from the migration path.
  const tables = [
    // ===== Shared account infrastructure =====
    //
    // saas_users is the top-level account record used by every product in this repo
    // (fundraising manager + dialer owner share the same login). team_members is used
    // by fundraising's fundraisers (`src/lib/fundraising-session.ts` → `getTeamSession`).
    // password_reset_tokens powers `/api/auth/reset-password`. payments and activity_log
    // are tiny shared tables we keep around for admin visibility; admin_messages /
    // admin_settings are kept so the schema stays consistent with existing production
    // DBs (the UI that read them is gone but the rows aren't worth dropping).
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
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    // Scheduled outbound phone calls (auto-dialer). At the planned time a Vercel cron
    // places the call via Twilio; when answered, Twilio plays the preset DTMF digit
    // sequence (e.g. navigating an IVR / phone menu automatically).
    `CREATE TABLE IF NOT EXISTS fr_scheduled_calls (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      to_number TEXT NOT NULL,
      digits TEXT,
      pause_seconds INTEGER NOT NULL DEFAULT 3,
      steps_json TEXT,
      label TEXT,
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      twilio_sid TEXT,
      call_status TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ];

  // Run each CREATE TABLE individually to avoid batch failures on existing schemas
  for (const sql of tables) {
    try { await client.execute(sql); } catch {}
  }

  // Migrations for existing databases.
  // BidMaster ALTER TABLE statements for bids / vendors / projects / bid_parameters etc.
  // were removed on 2026-11-01. Only the shared saas_users additions are retained since
  // they're still read by auth / Google OAuth / Stripe webhooks (even though the UI that
  // created new rows is gone, existing users have these columns and some are referenced
  // in session code).
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN google_id TEXT"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN avatar_url TEXT"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN notification_settings TEXT DEFAULT '{}'"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN stripe_customer_id TEXT"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN stripe_subscription_id TEXT"); } catch {}
  try { await client.execute("ALTER TABLE saas_users ADD COLUMN trial_end_date TEXT"); } catch {}
  // Reminder dedup pointer — links scheduled emails back to the payment they remind about
  try { await client.execute('ALTER TABLE fr_email_queue ADD COLUMN payment_id TEXT'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_email_queue_payment ON fr_email_queue(payment_id)'); } catch {}

  // (Removed auto-promote of pending users — admin must approve each new signup manually.)

  // Auto-dialer: store the IVR step sequence ({waitSeconds,digits}[]) as JSON.
  try { await client.execute('ALTER TABLE fr_scheduled_calls ADD COLUMN steps_json TEXT'); } catch {}
  // Auto-dialer recurrence: repeat on chosen weekdays at a set local time.
  try { await client.execute('ALTER TABLE fr_scheduled_calls ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { await client.execute('ALTER TABLE fr_scheduled_calls ADD COLUMN recur_days TEXT'); } catch {}   // CSV of weekdays 0=Sun..6=Sat
  try { await client.execute('ALTER TABLE fr_scheduled_calls ADD COLUMN recur_time TEXT'); } catch {}   // "HH:MM" local
  try { await client.execute('ALTER TABLE fr_scheduled_calls ADD COLUMN recur_tz TEXT'); } catch {}     // IANA timezone
  try { await client.execute('ALTER TABLE fr_scheduled_calls ADD COLUMN last_fired_date TEXT'); } catch {} // YYYY-MM-DD in recur_tz
  // Per-occurrence run log: each time a recurring call fires, a new row is inserted with
  // parent_id pointing at the recurring call, so every run has its own record + recording.
  try { await client.execute('ALTER TABLE fr_scheduled_calls ADD COLUMN parent_id TEXT'); } catch {}

  // Donor ratings: 1-5 (financial capacity = how wealthy; giving = how generous in practice).
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN financial_rating INTEGER'); } catch {}
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN giving_rating INTEGER'); } catch {}

  // Sub-projects: parent_id allows nesting (e.g. "Dinner" parent → "Dinner 2024", "Dinner 2025").
  try { await client.execute('ALTER TABLE fr_projects ADD COLUMN parent_id TEXT REFERENCES fr_projects(id) ON DELETE SET NULL'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_projects_parent ON fr_projects(parent_id)'); } catch {}

  // Payment sessions: track outbound redirects to the manager's external credit-card gateway.
  // Each session is a single attempt to charge a donor — links to the pre-created fr_pledge_payments row.
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_payment_sessions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      payment_id TEXT REFERENCES fr_pledge_payments(id) ON DELETE SET NULL,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      pledge_id TEXT REFERENCES fr_pledges(id) ON DELETE SET NULL,
      project_id TEXT REFERENCES fr_projects(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      token TEXT NOT NULL UNIQUE,
      webhook_secret TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      gateway_url TEXT,
      gateway_ref TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      failed_at TEXT,
      failure_reason TEXT
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_pay_sessions_token ON fr_payment_sessions(token)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_pay_sessions_owner ON fr_payment_sessions(owner_id, created_at DESC)'); } catch {}

  // Per-owner payment gateway URL (template). Stored alongside owner record.
  try { await client.execute('ALTER TABLE saas_users ADD COLUMN payment_gateway_url TEXT'); } catch {}

  // Hebrew name parts (split out from the combined hebrew_name). Common in yeshiva/Jewish-community
  // workflows: separate first name, last name, father's name (used in religious documents).
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN hebrew_first_name TEXT'); } catch {}
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN hebrew_last_name TEXT'); } catch {}
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN hebrew_father_name TEXT'); } catch {}
  // Hebrew honorific/title shown before the name (הרב, מרן, הגאון, הר"ר, מרת, ר', etc.)
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN hebrew_title TEXT'); } catch {}
  // Hebrew suffix title — shown after the name (שליט"א, זצ"ל, ע"ה, הי"ו, הכהן, הלוי, נ"י, etc.)
  try { await client.execute('ALTER TABLE fr_donors ADD COLUMN hebrew_suffix_title TEXT'); } catch {}

  // is_standalone: when a user records a "free donation" (no pledge), we still need a pledge row
  // to satisfy fr_pledge_payments.pledge_id NOT NULL — but we tag it as standalone so the UI
  // hides it from pledge lists. From the user's perspective: "this payment isn't on a pledge."
  // The payment still shows under the donor's Payments and counts in totals — it just doesn't
  // pollute the Pledges list with a fake 1-installment "pledge" they never agreed to.
  try { await client.execute('ALTER TABLE fr_pledges ADD COLUMN is_standalone INTEGER NOT NULL DEFAULT 0'); } catch {}

  // collection_mode: how the user expects to collect a multi-installment pledge.
  //   'manual' (default)  — we want to chase each installment separately. The pledge generates
  //                         N scheduled payment rows, each appears in Collections in its month.
  //   'automatic'         — the donor pays via auto-debit / external recurring billing. We
  //                         track ONE scheduled row (the total) so Collections doesn't nag the
  //                         user month after month. Money still gets logged as it arrives.
  // For single-payment pledges (installments_total = 1) this column has no effect — there's
  // only one row either way.
  try { await client.execute("ALTER TABLE fr_pledges ADD COLUMN collection_mode TEXT NOT NULL DEFAULT 'manual'"); } catch {}

  // payment_day: anchor for installment scheduling.
  //   monthly/quarterly/annual → day-of-month (1-31). If a target month is shorter (Feb 30),
  //                              we clamp to the last day of that month.
  //   weekly                   → day-of-week (0=Sun, 1=Mon, ..., 6=Sat).
  //   lump_sum / custom        → unused.
  // NULL means "use the day from pledge_date" — original behaviour.
  try { await client.execute('ALTER TABLE fr_pledges ADD COLUMN payment_day INTEGER'); } catch {}

  // Sola / Cardknox credentials (per owner). Keys are sensitive — only the SETTINGS API
  // returns them, and only masked. Server-side endpoints read them directly to call x1.cardknox.com.
  //   sola_xkey         — Cardknox API key (xKey). Server-only. Used for cc:sale + Report:Transactions.
  //   sola_ifields_key  — public-ish key for the browser-side iFields tokenizer.
  //   sola_software_name — registered with Cardknox for tracking (default 'easyfundraisings').
  try { await client.execute('ALTER TABLE saas_users ADD COLUMN sola_xkey TEXT'); } catch {}
  try { await client.execute('ALTER TABLE saas_users ADD COLUMN sola_ifields_key TEXT'); } catch {}
  try { await client.execute('ALTER TABLE saas_users ADD COLUMN sola_software_name TEXT'); } catch {}

  // Sola sync log — what we pulled from Report:Transactions and when. Lets the Settings page
  // show "Last sync: 5 minutes ago, 12 new payments, 3 updated".
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_sola_sync_log (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      from_date TEXT,
      to_date TEXT,
      transactions_seen INTEGER NOT NULL DEFAULT 0,
      payments_created INTEGER NOT NULL DEFAULT 0,
      payments_updated INTEGER NOT NULL DEFAULT 0,
      error TEXT
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_sola_sync_owner ON fr_sola_sync_log(owner_id, started_at DESC)'); } catch {}

  // Saved cards (Cardknox tokens).
  //   sola_token  — Cardknox xToken (vault reference). Returned by cc:sale with xCreateToken=1.
  //                 We charge it later with xCardNum=<token> (no CVV, no exp re-entry).
  //   cc_last4    — masked last-4 for display
  //   cc_brand    — Visa, MasterCard, Discover, Amex
  //   exp_month/year — for showing "exp 03/27" and detecting expiry
  //   status      — 'active' | 'expired' | 'removed'. Removed cards are hidden from pickers but
  //                 kept for audit (paid payments may reference them).
  // Tokens are per-merchant: only the owner that originally tokenized the card can charge it.
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_donor_cards (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      sola_token TEXT NOT NULL,
      cc_last4 TEXT,
      cc_brand TEXT,
      exp_month INTEGER,
      exp_year INTEGER,
      cardholder_name TEXT,
      billing_zip TEXT,
      billing_street TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_donor_cards_donor ON fr_donor_cards(donor_id, status)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_donor_cards_owner ON fr_donor_cards(owner_id, status)'); } catch {}

  // Auto-charge pledges: link a pledge to a saved card so the daily cron charges each
  // installment automatically on its due_date. Distinct from collection_mode='automatic'
  // (which means "donor pays externally via ACH/standing-order, no action needed from us").
  //   auto_charge_card_id  — FK to fr_donor_cards. NULL = no auto-charge.
  // Why a separate column (not a new collection_mode value)? Because user might want manual
  // chasing semantics (one row per installment in Collections) AND auto-charge — they're
  // orthogonal. When auto_charge_card_id is set, the cron tries the card; if it fails, the
  // row is left for Collections to chase manually as a 'failed' installment.
  try { await client.execute('ALTER TABLE fr_pledges ADD COLUMN auto_charge_card_id TEXT'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_pledges_auto_charge ON fr_pledges(auto_charge_card_id) WHERE auto_charge_card_id IS NOT NULL'); } catch {}

  // Auto-charge attempt log — every cron run that touches a payment row writes a row here.
  // Keeps the audit trail outside fr_pledge_payments (which only tracks the payment itself).
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_auto_charge_log (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      payment_id TEXT NOT NULL REFERENCES fr_pledge_payments(id) ON DELETE CASCADE,
      card_id TEXT REFERENCES fr_donor_cards(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      result TEXT NOT NULL,            -- 'approved' | 'declined' | 'error'
      gateway_ref TEXT,                -- xRefNum
      gateway_error TEXT,              -- xError / xErrorCode / our own message
      attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_auto_charge_log_payment ON fr_auto_charge_log(payment_id, attempted_at DESC)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_auto_charge_log_owner ON fr_auto_charge_log(owner_id, attempted_at DESC)'); } catch {}

  // Campaign prospects — donors you THINK you can fundraise from for a specific project
  // (rebranded "campaign" in the UI). These are private internal targets, not pledges:
  //   - estimated_amount: how much you hope to raise from this donor for this campaign
  //   - status: pending | called | confirmed | declined — call-list workflow state
  //   - NOT counted in totals, NOT shown in Pledges, NOT in Collections
  //
  // Use case: "I'm running a $50k campaign. Let me list 30 donors I think can give, with
  // estimated amounts, so I see what my goal is built on AND get a call list." Once a
  // prospect actually pledges, the manager creates a real fr_pledges row separately;
  // optionally they mark the prospect as 'confirmed' (or just delete it).
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_project_prospects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES fr_projects(id) ON DELETE CASCADE,
      donor_id TEXT NOT NULL REFERENCES fr_donors(id) ON DELETE CASCADE,
      estimated_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      contacted_at TEXT,
      UNIQUE(project_id, donor_id)
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_project_prospects_project ON fr_project_prospects(project_id, status)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_project_prospects_donor ON fr_project_prospects(donor_id)'); } catch {}

  // Email-sending settings (per owner) and outgoing-email log.
  //   email_from         — "From" address to use, e.g. "Yeshivas Toras Chaim <office@yourdomain.org>"
  //                        Must be a verified sender in Resend.
  //   email_signature    — appended to the end of every outgoing email (HTML allowed)
  //   resend_api_key     — owner's own Resend API key (re_...). Optional; if absent we
  //                        fall back to the platform-wide RESEND_API_KEY env var.
  //
  // Per-owner key is the right model for multi-tenant — each org bills their own emails
  // against their own Resend account. Falling back to a shared env var simplifies
  // initial onboarding before they set up Resend themselves.
  try { await client.execute('ALTER TABLE saas_users ADD COLUMN email_from TEXT'); } catch {}
  try { await client.execute('ALTER TABLE saas_users ADD COLUMN email_signature TEXT'); } catch {}
  try { await client.execute('ALTER TABLE saas_users ADD COLUMN resend_api_key TEXT'); } catch {}

  // Outgoing-email log — one row per send attempt. Captures:
  //   - to / cc / bcc, subject (for audit + "did we already send the receipt?")
  //   - related entities (donor_id, payment_id, project_id) so we can show "emails sent
  //     to this donor" on the profile + "receipts sent for this campaign" reports
  //   - resend_message_id (returned by Resend API) for cross-referencing in Resend's
  //     own dashboard / webhooks
  //   - status: 'sent' | 'failed' (we don't track delivery webhooks yet; that comes
  //     when we wire up Resend's bounce/complaint webhooks)
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_email_log (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      donor_id TEXT REFERENCES fr_donors(id) ON DELETE SET NULL,
      payment_id TEXT REFERENCES fr_pledge_payments(id) ON DELETE SET NULL,
      project_id TEXT REFERENCES fr_projects(id) ON DELETE SET NULL,
      to_address TEXT NOT NULL,
      cc TEXT,
      bcc TEXT,
      subject TEXT NOT NULL,
      body_preview TEXT,
      template TEXT,                 -- 'receipt' | 'campaign_blast' | 'custom' | ...
      status TEXT NOT NULL DEFAULT 'sent',
      resend_message_id TEXT,
      error_message TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_email_log_owner ON fr_email_log(owner_id, sent_at DESC)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_email_log_donor ON fr_email_log(donor_id, sent_at DESC)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_email_log_payment ON fr_email_log(payment_id)'); } catch {}

  // Per-donor email opt-out — donors can ask not to receive automated emails.
  // 'receipts_only' = will get auto receipts but no bulk campaigns. 'none' = no email at all.
  try { await client.execute("ALTER TABLE fr_donors ADD COLUMN email_opt_in TEXT NOT NULL DEFAULT 'all'"); } catch {}

  // Audit log — who edited what when. Required for any multi-user fundraising org so
  // edits to donor data / pledges / payments are accountable. Writes happen from a small
  // helper in src/lib/fundraising-audit.ts; reads happen from the /fundraising/audit-log
  // page (manager-only).
  //
  // The log doesn't try to be a full event-sourcing system — it just snapshots a JSON
  // before/after diff per significant write. Tracked actions:
  //   donor.create | donor.update | donor.delete | donor.restore
  //   pledge.create | pledge.update | pledge.delete | pledge.restore
  //   payment.create | payment.update | payment.delete | payment.charge_success | payment.charge_failed
  //   blast.send  (campaign blast — captures recipient count + subject)
  //   template.create | template.update | template.delete
  //
  // We retain entries indefinitely (no auto-purge) because the audit log doubles as a
  // change history for the donor profile. If size becomes an issue later we can purge
  // entries older than N months.
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_audit_log (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      actor_id TEXT,                  -- saas_users.id or team_members.id (audited as text)
      actor_label TEXT,               -- denormalized display name at time of action
      entity_type TEXT NOT NULL,      -- 'donor' | 'pledge' | 'payment' | 'blast' | 'template'
      entity_id TEXT,                 -- the affected entity's UUID (nullable for bulk events)
      action TEXT NOT NULL,           -- '.create' / '.update' / '.delete' / etc.
      summary TEXT,                   -- short human-readable summary of the change
      diff_json TEXT,                 -- optional JSON: { before: {...}, after: {...} }
      at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_audit_log_owner_at ON fr_audit_log(owner_id, at DESC)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_audit_log_entity ON fr_audit_log(entity_type, entity_id)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_audit_log_actor ON fr_audit_log(owner_id, actor_id, at DESC)'); } catch {}

  // Email templates — user-editable subject + HTML body for the emails we send.
  //
  //   kind:
  //     'receipt'   — used by /api/fundraising/sola/charge (and friends) when emailing the
  //                   donor after a successful charge. There's at most ONE active receipt
  //                   template per owner; if none exists we fall back to renderReceiptEmail's
  //                   built-in HTML so existing accounts keep getting receipts unchanged.
  //     'campaign'  — manager-saved templates the campaign email-blast UI can load into
  //                   the compose form. Many per owner, named.
  //     'thank_you' / 'custom' — generic buckets the UI can route to.
  //
  //   Variables: standard moustache-style {{first_name}}, {{last_name}}, {{full_name}},
  //   {{hebrew_name}}, {{amount}}, {{paid_date}}, {{method}}, {{project_name}},
  //   {{transaction_ref}}, {{organization_name}}, {{receipt_number}}. Receipt-specific
  //   variables are populated by the receipt-render path; campaign blasts only resolve the
  //   donor-related ones.
  //
  //   The body_text column is optional plain-text — Resend derives a sensible default from
  //   the HTML if we don't supply one.
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_email_templates (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      body_text TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_email_templates_owner ON fr_email_templates(owner_id, kind)'); } catch {}
  // At most one default-receipt-template per owner — the receipt-send path picks this row.
  // SQLite partial unique indexes work here; we keep the column-level constraint loose so
  // the user can toggle defaults via UPDATE without hitting a transient unique violation.
  try { await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_fr_email_templates_owner_kind_default ON fr_email_templates(owner_id, kind) WHERE is_default = 1"); } catch {}

  // Recycle Bin (סל מחזור) — 30-day soft-delete for donors, pledges, and payments.
  //
  // Design: we keep the soft-delete data in a single table rather than threading
  // `deleted_at IS NULL` into ~30 existing SELECT queries. When a record is deleted,
  // the API captures the row + all its dependent rows as a JSON snapshot, writes it
  // here, then runs the normal hard-DELETE (FK CASCADE handles the rest of the tree).
  //
  // Restore re-INSERTs from the snapshot. A daily cron purges entries older than 30d.
  //
  //   entity_type   — 'donor' | 'pledge' | 'payment'
  //   entity_id     — the original record's UUID (used in restore for ID re-use)
  //   summary       — short human label for the trash UI ("John Doe", "$500 pledge to X", ...)
  //   snapshot      — JSON with the row and all dependents needed to rebuild
  //   deleted_at    — purge clock starts here; 30d later the row is hard-removed
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS fr_recycle_bin (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      deleted_by TEXT,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_recycle_bin_owner ON fr_recycle_bin(owner_id, deleted_at DESC)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_fr_recycle_bin_entity ON fr_recycle_bin(entity_type, entity_id)'); } catch {}

  // BidMaster migrations (vendor_response_files, project_categories.budget, bid_templates
  // columns, bids.suggested_specs, vendors.reset_token*) were removed on 2026-11-01 along
  // with the rest of BidMaster. Existing production databases still have those columns —
  // this file no longer re-asserts them.

  // BidMaster trade-category seed data + bid-template seed data were removed on
  // 2026-11-01. Existing production DBs still carry those rows; new deployments start
  // without them.

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

  // Default admin-settings seed (admin_email / notification_email pointing at bidmaster.app)
  // was removed on 2026-11-01 — those values were used by BidMaster's admin panel and have
  // no consumer left in this repo. The admin_settings table itself is kept for schema
  // compatibility with existing databases.
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
