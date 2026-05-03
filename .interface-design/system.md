# BidMaster — Site Office NYC

A design system rooted in the NYC general contractor's site office: plywood walls,
clipboard with COIs, AIA forms tacked up, blueprint stack on the desk,
sidewalk shed visible through the window. Modernized through glass surfaces,
subtle motion, and engineering typography — but every meaningful element evokes
a paper artifact from the actual workflow.

## Who & Why

**The user:** A NYC general contractor / project manager juggling 5–15 simultaneous
bid packages across 30+ subcontractors. Half the day is chasing COIs, comparing
trade scopes line-by-line, and figuring out who hasn't submitted what.

**The job:** Reduce operational drag. In 5 seconds, see who is late, with what,
and act on it. This is a control desk, not a dashboard.

**The feel:** Precise like a drafting table, warm like an order pad, quiet enough
to use 8 hours a day.

## Direction

- **Domain truth.** Every signature element comes from real NYC construction:
  blueprints, sidewalk shed paint, DOB permit pink, AIA submittal stamps,
  hardhat color codes, G703 ledgers.
- **Glass on paper.** Surfaces are warm parchment (`--paper`) with a barely-there
  blueprint grid. Cards are translucent glass over the paper, not opaque white.
- **Stamps not pills.** Status uses double-bordered AIA-style stamps with mono
  caps — APPROVED / APPROVED AS NOTED / REVISE & RESUBMIT / REJECTED.
- **Ledger numbers.** Every currency and quantity is JetBrains Mono with tabular
  figures, right-aligned, with a `--rule` separator between rows. Never a stat
  card with icon-left, big-number-center.
- **One signature color: shed green.** Sidewalk shed paint is uniquely NYC.
  It marks active state on projects (the green ribbon) and reads as "approved"
  in submittal stamps. No other product would land on this color.

## Tokens

All values defined in `src/app/globals.css :root`. Use these — no hex literals
in component CSS.

### Surfaces & ink

```
--paper           #f7f3e9   /* canvas (warm newsprint) */
--paper-2         #fbf8ef   /* one elevation up */
--paper-3         #ffffff   /* dropdowns, modals */
--surface-glass   rgba(255,253,247,0.78)  /* cards on canvas, with blur(10px) */
--grid            rgba(28,93,142,0.04)    /* blueprint grid background */
--cast-iron       #0a1019   /* primary ink */
--cast-iron-2     #324b66   /* secondary ink */
--steel           #5e6770   /* muted */
--steel-soft      #98a2af   /* faint / placeholder */
--rule            rgba(10,16,25,0.08)     /* ledger row separator */
--border          rgba(10,16,25,0.10)     /* standard border */
--border-soft     rgba(10,16,25,0.06)     /* soft separator */
--border-strong   rgba(10,16,25,0.16)     /* emphasis */
```

### Domain colors (every one comes from real NYC construction)

```
--blueprint       #1c5d8e   /* Penn Yan blueprint paper — primary */
--blueprint-soft  #2c7bd1   /* lighter blueprint, links */
--blueprint-bg    #e9f0f7   /* tinted surface */
--shed-green      #2d7a3d   /* sidewalk shed paint — signature */
--shed-green-soft #3a9650
--shed-green-bg   #e8f3eb
--high-vis        #f0a830   /* hardhat / vest amber — primary CTA */
--high-vis-soft   #f8c065
--high-vis-bg     #fdf2db
--cone-orange     #e85d1f   /* DOT cone — destructive / urgent */
--cone-orange-bg  #fcebe1
--brownstone      #7a4023   /* UWS brick — secondary accent */
--brownstone-bg   #f3ebe4
--permit-pink     #e94b7a   /* DOB filing live — special status */
--permit-pink-bg  #fce5ed
--timber          #b8895a   /* raw wood — third accent */
```

### Hardhat trade colors (vendor / trade categorization)

```
--hh-electrical   #1c5d8e   /* Local 3 — blue */
--hh-plumbing     #b87333   /* copper */
--hh-carpentry    #b8895a   /* timber */
--hh-laborers     #f0a830   /* Local 79 — yellow */
--hh-pm           #e9e9e6   /* white hat */
--hh-foreman      #c0392b   /* red hat */
--hh-safety       #2d7a3d   /* green hat */
```

### Spacing

Base unit: `4px`. Scale: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64`. No
arbitrary values; every gap, padding, margin uses the scale.

### Radii

```
--r-sm    8px   /* inputs, buttons, chips */
--r-md   12px   /* cards */
--r-lg   20px   /* modals, sheets */
```

Mix is forbidden — small elements get `--r-sm`, cards get `--r-md`, full-screen
overlays get `--r-lg`.

### Depth

**Strategy: subtle shadows + glass surfaces.** No borders-only (cold), no
layered drop shadows (corporate). Cards lift off the paper with a quiet shadow
plus translucent fill.

```
--lift-1  0 1px 2px rgba(10,16,25,0.04), 0 0 0 1px var(--border-soft)
--lift-2  0 4px 12px -2px rgba(10,16,25,0.06), 0 0 0 1px var(--border)
--lift-3  0 12px 32px -8px rgba(10,16,25,0.10), 0 0 0 1px var(--border)
--ring    0 0 0 3px rgba(28,93,142,0.18)   /* focus ring (blueprint) */
```

### Motion

```
--ease-out      cubic-bezier(0.16, 1, 0.3, 1)
--dur-fast      120ms
--dur-base      220ms
--dur-slow      380ms
```

All transitions use `--ease-out`. No spring/bounce.

### Typography

Stack:

- `Inter Tight` — UI body & labels (precise, modern)
- `Bricolage Grotesque` — display / headlines (weight + character)
- `JetBrains Mono` — currency, IDs, ledger columns (tabular figures)

Scale (tight, intentional):

```
--t-display    34px / 1.1 / 700  Bricolage   /* hero */
--t-h1         24px / 1.2 / 700  Bricolage
--t-h2         18px / 1.3 / 700  Bricolage
--t-h3         15px / 1.4 / 700  Inter Tight
--t-body       14px / 1.5 / 450  Inter Tight
--t-small      13px / 1.45 / 450 Inter Tight
--t-label      11px / 1.3 / 700 / 0.08em uppercase Inter Tight
--t-mono       13px / 1.4 / 500  JetBrains Mono — tnum
--t-mono-lg    16px / 1.3 / 600  JetBrains Mono — tnum
```

`tnum` (tabular figures) is REQUIRED on every numeric column.

## Signature Patterns

### Submittal Stamp (`.stamp`)

Replaces every status pill. Double border (1px outer + 1px inner with 2px gap),
mono caps, `BY: name · date` footer line. Variants by AIA submittal categories:

| Variant | Token | Use |
|---|---|---|
| `.stamp.ok` | shed green | Approved / Awarded / On time |
| `.stamp.notes` | high-vis | Approved as Noted / Needs minor revision |
| `.stamp.revise` | cone orange | Revise & Resubmit / Late |
| `.stamp.reject` | brownstone | Rejected / Withdrawn |
| `.stamp.draft` | steel | Draft / Pending |

### Trade Chip (`.trade-chip`)

Color-coded by hardhat (`--hh-*` tokens). Always shows the trade name in caps,
small label, with a `2px` solid color block on the left. No emoji icons.

### G703 Ledger Row (`.g703-row`)

For bid comparisons, change orders, payment apps. Tabular layout:

```
| Item / Description       | Vendor A   | Vendor B   | Vendor C   | Δ vs avg |
| ──────────────────────── | ────────── | ────────── | ────────── | ──────── |
| ...                                                                        |
```

- Description column left-aligned, Inter Tight body.
- Numeric columns right-aligned, JetBrains Mono with tnum.
- 1px `--rule` between rows (not full border).
- "Best price" cell highlighted with `--shed-green-bg` and a 2px left border in
  `--shed-green`.

### Permit Pink Ribbon (`.permit-ribbon`)

A 4px-tall pink bar across the top of a project card when DOB filing is live.
Tooltip on hover shows filing number and last action date.

### Shed-Green Active Marker (`.shed-active`)

A 6px `--shed-green` left edge on rows / cards that represent currently active
projects. The "you're working on this right now" signal.

### Blueprint Grid Background (`.bp-grid`)

A 24×24px grid drawn from `--grid` color over `--paper`. Used on the canvas
behind glass cards and on the login brand panel. So subtle you only notice
when you're looking for it.

## What this rejects

- ❌ Generic KPI bento cards → use ledger rows for numeric data, or hero
  numbers with no chrome.
- ❌ Pill status badges → submittal stamps.
- ❌ Sidebar with abstract icons → "Site Office" navigation: Plans · Subs ·
  Bids · Submittals · Pay Apps · Punch List.
- ❌ Multi-color status palettes (red/yellow/green/blue) → only the 5 stamp
  variants above; trade colors only via hardhat tokens.
- ❌ Drop shadows on text or borders that scream → soft glass + 1px borders.
- ❌ Emoji in production UI → use SVG glyphs only.

## Per-component checklist

Before writing any UI code, declare:

```
Intent      : [who, what action, what feeling]
Palette     : [tokens used, why they fit]
Depth       : [--lift-*]
Surfaces    : [paper / glass / paper-2]
Typography  : [which scale entries]
Spacing     : [base unit usage]
Signature   : [which stamp/chip/ledger element makes it Site Office, not generic]
```

If the same code could ship on any SaaS without changes, it has defaulted.

## Pilot status

- ✅ Tokens & primitives in `globals.css`
- ✅ `/login` redesigned (pilot)
- ⏳ Customer dashboard (`/customer`)
- ⏳ Admin panel (`/admin-panel`)
- ⏳ Vendor portal (`/vendor`, `/vendor-submit`)
- ⏳ Landing page (`/`)
