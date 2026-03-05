# Architecture

## Overview

The Bid Platform is a full-stack Next.js application with two user roles (Customer and Vendor) that communicate through a shared SQLite database. There is no authentication - this is a POC.

## Data Flow

```
Customer creates bid          Vendor submits prices              Customer views prices
       |                              |                                  |
       v                              v                                  v
  POST /api/bids              POST /api/bids/[id]/respond         GET /api/bids/[id]
       |                              |                                  |
       v                              v                                  v
  bids table                  vendor_responses table              For each vendor response:
  bid_parameters table          (pricing_mode, base_price,        - combination: direct lookup
  bid_parameter_options table    rules)                           - additive: base + additions
  bid_files table             vendor_prices table                   - rules applied
```

## Database Design

### Tables

**bids**
- `id` TEXT PRIMARY KEY (UUID)
- `title` TEXT
- `description` TEXT
- `deadline` TEXT
- `created_at` TEXT (auto-set)

**bid_parameters**
- `id` TEXT PRIMARY KEY (UUID)
- `bid_id` TEXT FK -> bids
- `name` TEXT (e.g., "Color")
- `sort_order` INTEGER

**bid_parameter_options**
- `id` TEXT PRIMARY KEY (UUID)
- `parameter_id` TEXT FK -> bid_parameters
- `value` TEXT (e.g., "Red")
- `sort_order` INTEGER

**bid_files**
- `id` TEXT PRIMARY KEY (UUID)
- `bid_id` TEXT FK -> bids
- `filename` TEXT
- `data` BLOB

**vendor_responses**
- `id` TEXT PRIMARY KEY (UUID)
- `bid_id` TEXT FK -> bids
- `vendor_name` TEXT
- `pricing_mode` TEXT ("combination" or "additive")
- `base_price` REAL (additive mode only)
- `rules` TEXT (JSON array of discount rules, additive mode only)
- `submitted_at` TEXT (auto-set)

**vendor_prices**
- `id` TEXT PRIMARY KEY (UUID)
- `response_id` TEXT FK -> vendor_responses
- `combination_key` TEXT (JSON string - format depends on pricing mode)
- `price` REAL

### Combination Key Formats

**Combination mode** - maps parameter names to selected values (sorted alphabetically):
```json
{"Color":"Red","Material":"Wood","Size":"Large"}
```

**Additive mode** - maps a single parameter + option:
```json
{"param":"Color","option":"Red"}
```

### Discount Rules Format

Stored as JSON in `vendor_responses.rules`:
```json
[
  {
    "conditionParam": "Material",
    "conditionOption": "Wood",
    "targetType": "total",
    "targetParam": "",
    "targetOption": "",
    "discountType": "percentage",
    "discountValue": 10
  }
]
```

See [PRICING_MODES.md](PRICING_MODES.md) for full details on rule types and calculation order.

### Database Migrations

The `db.ts` file uses try/catch ALTER TABLE statements to add new columns to existing databases:
- `pricing_mode` on vendor_responses
- `base_price` on vendor_responses
- `rules` on vendor_responses

This allows the schema to evolve without breaking existing data.

## Frontend Pages

### Home (`/`)
- Static page with two role cards linking to `/customer` and `/vendor`

### Customer Dashboard (`/customer`)
- Client component, fetches `GET /api/bids`
- Displays bid cards with title, deadline, vendor response count
- Links to create page and individual bid detail pages

### Create Bid (`/customer/create`)
- Client component with controlled form
- Dynamic parameter builder with chip/tag UI for options
- Two-step submit: POST bid JSON, then POST files as FormData
- Redirects to dashboard on success

### Price Comparison (`/customer/[id]`)
- Client component, fetches `GET /api/bids/[id]`
- Renders a dropdown (`<select>`) for each parameter
- Handles both pricing modes when calculating prices:
  - **Combination**: direct lookup by combination_key
  - **Additive**: base_price + sum of option additions, then applies discount rules
- Displays all results in a unified table sorted by price ascending
- Shows pricing mode badge per vendor

### Vendor Dashboard (`/vendor`)
- Client component, fetches `GET /api/bids`
- Lists all bids with title, description, deadline

### Price Submission (`/vendor/[id]`)
- Client component, fetches `GET /api/bids/[id]`
- **Pricing mode toggle**: two cards showing "Combination" and "Additive" with price counts
- **Combination mode**: generates cartesian product, renders a row per combination
- **Additive mode**: base price input + per-option addition inputs grouped by parameter
- **Conditional discount rules** (additive only): rule builder UI with dropdowns for conditions, targets, and discount types
- Downloads attached files via `/api/bids/[id]/files/[fileId]`
- Submits prices + rules in a single POST to `/api/bids/[id]/respond`

## API Design

All API routes use the Next.js App Router pattern with:
- `NextResponse` for JSON responses
- `crypto.randomUUID()` for ID generation
- `better-sqlite3` transactions for multi-table inserts
- `params: Promise<{...}>` (Next.js 16 async params)

### Error Handling
- All routes wrapped in try/catch
- Returns appropriate HTTP status codes (400, 404, 500)
- JSON error responses with `{ error: string }`

## Key Design Decisions

1. **SQLite over PostgreSQL**: Simpler for POC, no external service needed, single file database (`bids.db`)
2. **No auth**: POC simplicity - anyone can create bids or submit prices
3. **Files as BLOBs**: Stored directly in SQLite for simplicity (not suitable for large files in production)
4. **Cartesian product on client**: The vendor page generates all combinations client-side rather than pre-computing on the server
5. **JSON combination keys**: Simple string matching for price lookup, keys are sorted alphabetically for consistency
6. **Rules as JSON blob**: Discount rules stored as a JSON column rather than a separate table - simpler for POC, rules are always loaded with the response
7. **Price calculation on client**: Both pricing modes calculate final prices client-side for instant feedback when changing dropdown selections
8. **serverExternalPackages**: `better-sqlite3` is a native C++ module that must be excluded from Turbopack bundling via `next.config.ts`
