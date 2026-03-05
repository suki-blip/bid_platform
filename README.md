# Bid Platform

A web application for creating detailed bid requests with multiple parameters, collecting vendor pricing, and comparing prices through simple dropdown menus. Supports multiple pricing modes including conditional discounts.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite via better-sqlite3
- **Tunneling**: ngrok (for temporary public URL)

## Getting Started

```bash
npm install
npm run dev
```

App runs at http://localhost:3000

### Expose publicly (temporary)

```bash
ngrok http 3000
```

## How It Works

### Customer Flow
1. Go to `/customer` and click **+ New Bid**
2. Fill in title, description, deadline
3. Attach files (specs, drawings, etc.)
4. Add **parameters** with options (e.g., Material: Wood/Steel/Aluminum, Size: S/M/L)
5. Submit the bid request
6. Once vendors respond, go to your bid and use **dropdown menus** for each parameter to see all vendor prices for that combination, sorted cheapest first

### Vendor Flow
1. Go to `/vendor` and browse available bids
2. Click a bid to see details and download attached files
3. Enter your company name
4. Choose a **pricing mode** (see below)
5. Fill in prices and submit

### Pricing Modes

Vendors can choose between two pricing approaches:

| Mode | How it works | Number of prices |
|---|---|---|
| **Combination** | Unique price for every parameter combination | Exponential (options1 x options2 x ...) |
| **Additive** | Base price + per-option additions + optional discount rules | Linear (sum of all options) |

See [docs/PRICING_MODES.md](docs/PRICING_MODES.md) for full details.

### Price Comparison
- The customer selects one option per parameter via dropdowns
- All vendor prices (from both pricing modes) are displayed in a unified table
- Prices are sorted from lowest to highest
- A badge shows which pricing mode each vendor used

## Project Structure

```
src/
  app/
    page.tsx                          # Home - role selection (Customer/Vendor)
    layout.tsx                        # Root layout with fonts and metadata
    globals.css                       # Tailwind import
    customer/
      page.tsx                        # Customer dashboard - list of bids
      create/
        page.tsx                      # Create new bid form
      [id]/
        page.tsx                      # Price comparison view with dropdowns
    vendor/
      page.tsx                        # Vendor dashboard - browse bids
      [id]/
        page.tsx                      # Price submission with mode toggle
    api/
      bids/
        route.ts                      # GET all bids, POST create bid
        [id]/
          route.ts                    # GET single bid with full details
          respond/
            route.ts                  # POST vendor price submission
          files/
            route.ts                  # GET list files, POST upload files
            [fileId]/
              route.ts                # GET download a file
  lib/
    db.ts                             # SQLite database initialization + migrations
    types.ts                          # TypeScript interfaces
```

## Database Schema

| Table | Purpose |
|---|---|
| `bids` | Bid requests (title, description, deadline) |
| `bid_parameters` | Parameters for each bid (e.g., "Color", "Size") |
| `bid_parameter_options` | Options per parameter (e.g., "Red", "Blue") |
| `bid_files` | Uploaded file attachments (stored as blobs) |
| `vendor_responses` | Vendor submissions (name, pricing_mode, base_price, rules, timestamp) |
| `vendor_prices` | Price entries per vendor response (combination_key + price) |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/bids` | List all bids with parameters |
| POST | `/api/bids` | Create a new bid with parameters |
| GET | `/api/bids/[id]` | Get bid details, files, vendor responses with prices and rules |
| POST | `/api/bids/[id]/respond` | Submit vendor prices (supports both pricing modes) |
| GET | `/api/bids/[id]/files` | List files for a bid |
| POST | `/api/bids/[id]/files` | Upload files to a bid |
| GET | `/api/bids/[id]/files/[fileId]` | Download a file |

See [docs/API.md](docs/API.md) for full request/response examples.

## Configuration

`next.config.ts`:
- `serverExternalPackages: ["better-sqlite3"]` - required for native module compatibility with Turbopack
- `allowedDevOrigins: ["*.ngrok-free.dev"]` - allows ngrok tunneling in dev mode
