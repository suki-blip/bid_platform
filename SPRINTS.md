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

## Sprint 2 — Vendor Management

Enables the invite flow that makes the platform useful

| Task | Why |
|---|---|
| Vendor contacts table in DB | Replace anonymous vendor_name with managed contacts |
| Add/edit/remove vendors | Wire up the Vendors page (currently void) |
| CSV import for bulk vendor upload | SRS Critical priority |
| Assign vendors to bids | Generate unique invite links per vendor |
| Vendor link with token (no login) | Core SRS differentiator |

---

## Sprint 3 — Winner Selection + Email

Closes the bid lifecycle loop

| Task | Why |
|---|---|
| Select winner on comparison page | Button exists but is void |
| Email service (Resend/SendGrid) | Unblocks all notifications |
| Bid invitation emails with unique vendor links | Core flow |
| Winner/loser notification emails | SRS Critical |
| Auto-reminders before deadline | SRS Critical |

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
