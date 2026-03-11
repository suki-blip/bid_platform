# Sprint Roadmap

---

## Sprint 1 — CRUD Completeness + Project Hierarchy ✅ COMPLETED

Foundation work that everything else depends on.

### Deliverables

| Task | Status | Details |
|---|---|---|
| Edit/delete bids | ✅ Done | PATCH & DELETE on `/api/bids/[id]` — edit title, description, deadline, status, project_id |
| Bid status lifecycle | ✅ Done | `draft → active → closed → awarded` with validation |
| Project layer (DB + API) | ✅ Done | `projects` table with FK `bids.project_id → projects.id` (ON DELETE SET NULL) |
| Project CRUD | ✅ Done | GET/POST `/api/projects`, GET/PATCH/DELETE `/api/projects/[id]` |
| Sidebar project → bids tree | ✅ Done | Expandable project accordion in customer layout, bids grouped under projects |
| Dashboard grouped by projects | ✅ Done | KPI cards (Active Projects, Open Bids, Responses, Rate) + project accordion with bid tables |
| New Project page | ✅ Done | Full form (name, address, type, description) posting to `/api/projects` |
| Create Bid with project selector | ✅ Done | Dropdown to assign bid to project, reads `?project=` from URL |
| Vercel deployment fix | ✅ Done | Resolved Proxy private-member error with `@libsql/client` on serverless runtime |

### Key Technical Decisions

- **Lazy DB initialization**: `db()` returns the real `@libsql/client` Client (no Proxy) — avoids build-time connection errors and Vercel private-member issue
- **Schema migrations**: Individual `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` with try/catch for Turso compatibility
- **Test isolation**: Vitest + in-memory `better-sqlite3` — 119 tests, 7 test files, ~230ms total

### Files Changed

| File | What |
|---|---|
| `src/lib/db.ts` | Lazy client init, projects table, migrations |
| `src/app/api/projects/route.ts` | GET (list with bid_count), POST |
| `src/app/api/projects/[id]/route.ts` | GET (project + bids), PATCH, DELETE |
| `src/app/api/bids/route.ts` | Updated POST with `project_id`, `status` |
| `src/app/api/bids/[id]/route.ts` | Added PATCH (edit) and DELETE (cascade) |
| `src/app/customer/layout.tsx` | Sidebar with project tree, expand/collapse |
| `src/app/customer/page.tsx` | Dashboard with KPI cards + project accordion |
| `src/app/customer/create/page.tsx` | Project selector dropdown |
| `src/app/customer/new-project/page.tsx` | Full project creation form |
| `src/app/customer/[id]/page.tsx` | Status dropdown + delete button |
| `tests/helpers/test-db.ts` | `seedProject`, updated `seedBid` with status/project_id |
| `tests/system/projects-crud.test.ts` | 11 tests for project CRUD |
| `tests/system/bids-crud.test.ts` | 23 tests (includes status, project_id, edit, delete) |
| `tests/system/schema-integrity.test.ts` | 26 tests (includes projects table) |

### Test Coverage

```
 ✓ projects-crud.test.ts        11 tests
 ✓ bids-crud.test.ts            23 tests
 ✓ schema-integrity.test.ts     26 tests
 ✓ vendor-responses.test.ts     13 tests
 ✓ price-comparison.test.ts      6 tests
 ✓ discount-rules.test.ts       18 tests
 ✓ file-attachments.test.ts     22 tests
   ─────────────────────────────────
   Total                        119 tests — all passing
```

### Commits

```
43da883 Sprint 1: Add project hierarchy, bid CRUD, and status management
9e794f2 Fix PRAGMA foreign_keys for Turso compatibility
3551b33 Run schema init statements individually for Turso compatibility
1a45f6e Add error details to projects API response for debugging Vercel 500
a274e94 Fix Vercel 500: replace Proxy with direct getClient() calls
```

---

## Sprint 2 — Vendor Management ✅ COMPLETED

Enables the invite flow that makes the platform useful.

### Deliverables

| Task | Status | Details |
|---|---|---|
| `vendors` table | ✅ Done | Full profile: name, email, cc_emails, phone, contact_person, trade_category FK, website, license, notes, status (active/suspended/removed) |
| `trade_categories` table + 25 defaults | ✅ Done | 4 groups: Structure (7), MEP (6), Finishes (8), Site (4). Supports custom categories |
| `bid_invitations` table | ✅ Done | Per-vendor unique token, status lifecycle (pending → opened → submitted/declined/expired) |
| `vendor_responses.vendor_id` FK | ✅ Done | New column with migration for existing rows |
| Vendor CRUD API | ✅ Done | GET/POST `/api/vendors`, GET/PATCH/DELETE `/api/vendors/[id]` — soft-delete, trade filtering, duplicate email guard (409) |
| Trade categories API | ✅ Done | GET `/api/trade-categories`, POST for custom categories (unique name enforced) |
| CSV import API | ✅ Done | POST `/api/vendors/import` — case-insensitive trade matching, returns `{ created, errors[] }` |
| Bid invitation API | ✅ Done | GET/POST `/api/bids/[id]/invite` — generates unique tokens, prevents duplicate invites |
| Token-based submission API | ✅ Done | GET `/api/vendor-submit/[token]` loads bid + params. POST submits prices, marks invitation as submitted |
| Vendors management page | ✅ Done | List, search, filter by trade, add vendor modal, CSV import modal, suspend/remove actions |
| Invite vendors from bid detail | ✅ Done | Vendor picker (excludes already-invited), invitation status table, copy share link |
| Vendor submission page | ✅ Done | Public `/vendor-submit/[token]` — branded form, price grid for all combinations, thank-you on submit, expired/already-submitted guards |

### Key Technical Decisions

- **No-login vendor model**: Vendors access bids via unique UUID tokens — no account required (core SRS differentiator)
- **Soft-delete vendors**: Status set to `removed` rather than hard delete — preserves historical bid data
- **Token lifecycle**: pending → opened (on GET) → submitted (on POST). Expired if past bid deadline or bid not active
- **CSV import**: Server-side parsing with case-insensitive trade matching, duplicate email detection, per-row error reporting
- **25 default trade categories**: Seeded via `INSERT OR IGNORE` in `initializeDatabase()` — idempotent across deploys

### Schema Diagram

```
projects 1──∞ bids 1──∞ bid_invitations ∞──1 vendors
                │                                │
                ∞                                │
          vendor_responses ──────────────────────┘
                │                          (vendor_id FK)
                ∞
          vendor_prices

trade_categories 1──∞ vendors (trade_category FK)
```

### Files Changed

| File | What |
|---|---|
| `src/lib/db.ts` | Added vendors, trade_categories, bid_invitations tables + vendor_id migration + default category seeding |
| `src/app/api/vendors/route.ts` | GET (list with trade join, filter by status/trade), POST (create with unique email) |
| `src/app/api/vendors/[id]/route.ts` | GET (single with trade join), PATCH (update any field), DELETE (soft-delete) |
| `src/app/api/vendors/import/route.ts` | POST (bulk import from parsed CSV rows) |
| `src/app/api/trade-categories/route.ts` | GET (list all), POST (create custom) |
| `src/app/api/bids/[id]/invite/route.ts` | GET (list invitations), POST (create invitations with unique tokens) |
| `src/app/api/vendor-submit/[token]/route.ts` | GET (validate token, return bid), POST (submit prices, update invitation) |
| `src/app/customer/vendors/page.tsx` | Full vendor management UI (was void placeholder) |
| `src/app/customer/[id]/page.tsx` | Added invite button, invitation table, copy link, vendor picker modal |
| `src/app/vendor-submit/[token]/page.tsx` | New public submission page with branded header, price grid, deadline countdown |
| `tests/helpers/test-db.ts` | Added 3 new tables + `seedTradeCategory`, `seedVendor`, `seedBidInvitation` helpers |
| `tests/system/vendors-crud.test.ts` | 12 tests: create, read, update, suspend, reactivate, soft-delete, trade FK |
| `tests/system/trade-categories.test.ts` | 7 tests: defaults, groups, custom, unique names, vendor association |
| `tests/system/vendor-import.test.ts` | 8 tests: valid import, case matching, missing fields, duplicates, unknown trades |
| `tests/system/bid-invitations.test.ts` | 13 tests: create, unique tokens, status transitions, token lookup, cascade deletes |
| `tests/system/vendor-submit.test.ts` | 9 tests: valid submit, vendor_id link, prices stored, reject invalid/duplicate/expired |

### Test Coverage

```
 ✓ vendors-crud.test.ts          12 tests
 ✓ trade-categories.test.ts       7 tests
 ✓ vendor-import.test.ts          8 tests
 ✓ bid-invitations.test.ts       13 tests
 ✓ vendor-submit.test.ts          9 tests
 ✓ projects-crud.test.ts         11 tests
 ✓ bids-crud.test.ts             23 tests
 ✓ schema-integrity.test.ts      26 tests
 ✓ vendor-responses.test.ts      13 tests
 ✓ price-comparison.test.ts       6 tests
 ✓ discount-rules.test.ts        18 tests
 ✓ file-attachments.test.ts      22 tests
   ─────────────────────────────────
   Total                         168 tests — all passing
```

### Commits

```
337d09c Plan Sprint 2: Vendor Management with 22 tasks across 4 phases
8ee4d52 Sprint 2: Vendor management, invitations, and token-based submissions
```

---

## Sprint 3 — Winner Selection + Email + Export ✅ COMPLETED

Closes the bid lifecycle loop — from invite to award.

### Deliverables

| Task | Status | Details |
|---|---|---|
| `bid_winners` table | ✅ Done | One winner per bid (unique bid_id), FK to vendor + vendor_response, optional notes |
| `reminder_log` table | ✅ Done | Tracks sent reminders per invitation to prevent duplicates |
| Winner selection API | ✅ Done | POST `/api/bids/[id]/winner` — creates winner, auto-awards bid, expires pending invitations, sends winner/loser emails |
| Finalize bid API | ✅ Done | POST `/api/bids/[id]/finalize` — requires winner, locks bid, expires pending/opened invitations |
| CSV export API | ✅ Done | GET `/api/bids/[id]/export` — generates CSV with vendor × parameter × price rows, triggers download |
| Email helper module | ✅ Done | `src/lib/email.ts` — Resend API wrapper via fetch (no SDK dep), graceful no-op without API key |
| Invitation emails | ✅ Done | Sent on vendor invite with bid title, description, deadline, unique submit link |
| Winner notification email | ✅ Done | Congratulations email with bid summary and optional notes |
| Loser notification email | ✅ Done | "Not selected" email to all other submitted vendors |
| Deadline reminder cron | ✅ Done | POST `/api/cron/reminders` — 5-day and 2-day reminders, duplicate-safe via `reminder_log`, optional `CRON_SECRET` auth |
| Select winner button | ✅ Done | Comparison table Select → confirmation dialog → winner badge, locks other Select buttons |
| Finalize button | ✅ Done | Locks bid, shows "Finalized" state, disables when already awarded |
| Export CSV button | ✅ Done | Triggers browser download of full comparison spreadsheet |

### Key Technical Decisions

- **Email via fetch, not SDK**: Uses Resend REST API directly — avoids adding a dependency, keeps bundle small
- **Graceful email no-op**: Without `RESEND_API_KEY`, emails are silently skipped (logs warning) — dev-friendly
- **Reminder deduplication**: `reminder_log` table prevents sending the same reminder twice, supports both first (5d) and second (2d) types
- **Cron-ready**: `/api/cron/reminders` is a standard POST endpoint — works with Vercel Cron, external schedulers, or manual triggers
- **Winner auto-awards**: Selecting a winner automatically sets bid status to `awarded` and expires pending invitations in a single batch

### Email Templates

| Email | Trigger | Recipient |
|---|---|---|
| Bid Invitation | Vendor invited | Vendor email |
| Deadline Reminder (5d) | Cron, 5 days before | Pending/opened vendors |
| Deadline Reminder (2d) | Cron, 2 days before | Pending/opened vendors |
| Winner Notification | Winner selected | Winning vendor |
| Not Selected | Winner selected | All other submitted vendors |

### Files Changed

| File | What |
|---|---|
| `src/lib/db.ts` | Added `bid_winners` and `reminder_log` tables |
| `src/lib/email.ts` | New — Resend wrapper + 4 HTML email template functions |
| `src/app/api/bids/[id]/winner/route.ts` | New — GET/POST winner selection with email notifications |
| `src/app/api/bids/[id]/finalize/route.ts` | New — POST finalize with invitation expiry |
| `src/app/api/bids/[id]/export/route.ts` | New — GET CSV export |
| `src/app/api/bids/[id]/invite/route.ts` | Updated — sends invitation emails on invite |
| `src/app/api/cron/reminders/route.ts` | New — deadline reminder cron endpoint |
| `src/app/customer/[id]/page.tsx` | Wired Select/Finalize/Export buttons, winner badge, winner state |
| `tests/helpers/test-db.ts` | Added `bid_winners`, `reminder_log` tables + `seedVendorResponse`, `seedBidWinner` helpers |
| `tests/system/winner-selection.test.ts` | 9 tests: select winner, enforce one per bid, cascade deletes, loser query |
| `tests/system/bid-finalize.test.ts` | 10 tests: finalize flow, expire invitations, rejection cases |
| `tests/system/csv-export.test.ts` | 7 tests: empty export, single/multi vendor, quoted names, no-param bids |
| `tests/system/reminders.test.ts` | 12 tests: find 5d/2d reminders, skip submitted/draft/awarded, deduplication, cascade |

### Test Coverage

```
 ✓ winner-selection.test.ts       9 tests
 ✓ bid-finalize.test.ts          10 tests
 ✓ csv-export.test.ts             7 tests
 ✓ reminders.test.ts             12 tests
 ✓ vendors-crud.test.ts          12 tests
 ✓ trade-categories.test.ts       7 tests
 ✓ vendor-import.test.ts          8 tests
 ✓ bid-invitations.test.ts       13 tests
 ✓ vendor-submit.test.ts          9 tests
 ✓ projects-crud.test.ts         11 tests
 ✓ bids-crud.test.ts             23 tests
 ✓ schema-integrity.test.ts      26 tests
 ✓ vendor-responses.test.ts      13 tests
 ✓ price-comparison.test.ts       6 tests
 ✓ discount-rules.test.ts        18 tests
 ✓ file-attachments.test.ts      22 tests
   ─────────────────────────────────
   Total                         206 tests — all passing
```

### Commits

```
c631080 Plan Sprint 3: Winner selection, email notifications, CSV export
094143b Sprint 3: Winner selection, email notifications, CSV export, reminders
```

### Setup Notes

To enable emails on Vercel, add `RESEND_API_KEY` to environment variables. Without it, all emails are silently skipped (dev-safe). Optionally add `CRON_SECRET` to protect the reminder endpoint.

---

## Sprint 3.5 — Admin Panel (Operational Dashboard)

Independent admin panel for system-wide visibility and management. Designed to be extractable to a separate server later.

### Architecture

- **Secret URL**: All admin pages at `/admin-{ADMIN_SECRET_PATH}/...` (env var, not guessable)
- **Middleware**: Validates secret path segment on every admin request
- **Admin API**: All routes under `/api/admin/...` protected by `ADMIN_API_SECRET` header
- **Self-contained**: Own layout, own API routes, shared libs only (`db.ts`, `email.ts`)
- **Extraction-ready**: To move later → copy `src/app/admin-panel/`, `src/app/api/admin/`, point at same DB

### Phase 1 — Infrastructure

| # | Task | Details | Files |
|---|---|---|---|
| 1 | `ADMIN_SECRET_PATH` env var | Random slug (e.g. `bm-ctrl-7f2a9x`), used as URL segment | `.env.local` |
| 2 | Admin middleware | Validate `/admin-panel/[key]` matches env var, reject with 404 otherwise | `src/middleware.ts` |
| 3 | Admin layout | Own sidebar: Dashboard, Projects, Bids, Vendors, Invitations, System | `src/app/admin-panel/[key]/layout.tsx` |
| 4 | Admin API auth | Check `x-admin-secret` header on all `/api/admin/*` routes | `src/app/api/admin/middleware-helper.ts` |

### Phase 2 — Dashboard & Read Views

| # | Task | Details | Files |
|---|---|---|---|
| 5 | Admin dashboard | KPI cards: total projects, active bids, vendors, invitations sent, response rate, awarded bids. Recent activity feed | `src/app/admin-panel/[key]/page.tsx` |
| 6 | Projects list API + page | All projects with bid counts, status, created date. Search/filter | `src/app/api/admin/projects/route.ts`, page |
| 7 | Bids list API + page | All bids with status, vendor response count, winner info, deadline. Filter by status | `src/app/api/admin/bids/route.ts`, page |
| 8 | Vendors list API + page | All vendors (including removed), invitation history, response rate, win rate | `src/app/api/admin/vendors/route.ts`, page |
| 9 | Invitations overview API + page | All invitations across all bids: token, status, vendor, sent/opened/submitted dates | `src/app/api/admin/invitations/route.ts`, page |

### Phase 3 — System Management

| # | Task | Details | Files |
|---|---|---|---|
| 10 | Reminder settings API + page | View/edit reminder config: first_days, second_days. Manual "Run Reminders Now" button | `src/app/api/admin/settings/route.ts`, page |
| 11 | Email log page | Show recent reminder_log entries with invitation details | `src/app/api/admin/email-log/route.ts`, page |
| 12 | DB stats API | Table row counts, last activity timestamps | `src/app/api/admin/stats/route.ts` |

### Phase 4 — Tests

| # | Task | Details | Files |
|---|---|---|---|
| 13 | Admin API auth tests | Reject without secret, accept with correct secret | `tests/system/admin-auth.test.ts` |
| 14 | Admin stats tests | Verify KPI calculations, counts, rates | `tests/system/admin-stats.test.ts` |

### Definition of Done

- [ ] Admin panel accessible only via secret URL
- [ ] Dashboard shows real-time KPI metrics
- [ ] Can browse all projects, bids, vendors, invitations
- [ ] Can view email/reminder log
- [ ] Can trigger manual reminder run
- [ ] 404 returned for wrong/missing admin secret
- [ ] All admin code in clearly separated directories (extractable)

---

## Sprint 4 — Auth + Multi-tenancy

Makes it a real SaaS product

| Task | Why |
|---|---|
| Auth system (email/password + JWT) | Currently no login at all |
| User roles (Owner/Admin/Editor/Viewer) | SRS Critical |
| Team invites | Owner invites team members |
| Row-level security (account isolation) | SRS requirement for multi-tenant |
| DB migration to PostgreSQL/Supabase | SQLite won't scale for multi-user |

---

## Sprint 5 — Payments + Polish (Launch)
