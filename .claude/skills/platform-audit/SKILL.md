---
name: platform-audit
description: Comprehensive review of the fundraising platform that returns prioritized suggestions across design (visual polish, layout), usability (friction points, missing affordances), and features (capability gaps). Use whenever the user wants ideas for what to improve next — e.g. "what should I work on?", "audit the platform", "suggest improvements", "תציע לי מה לשפר".
---

# Platform Audit Skill

You are reviewing the **easyfundraisings / bid_platform** CRM (a Next.js 16 + Turso/libsql donor-management platform deployed on Vercel). Your job is to scan the codebase and produce a **prioritized list of concrete improvements** organized into three buckets.

This skill should produce a *short, actionable report* — not a 50-page essay. Aim for 12–20 suggestions total, with the punchiest 3–5 highlighted at the top.

## When to invoke

Trigger phrases (English or Hebrew):
- "audit the platform", "review the platform", "what should I add"
- "תציע לי מה לשפר", "סקור את התוכנה", "מה אפשר להוסיף", "תעבור על התוכנה"
- Any request asking for improvement ideas across design / UX / features

## Methodology

Work through these passes in order. **Don't skip passes** — each one finds a different class of issue.

### Pass 1 — Inventory (1 minute, use Glob/Read sparingly)

Open these files to understand current state, no need to read fully:
- `src/app/fundraising/layout.tsx` — nav structure, what's exposed
- `src/app/fundraising/page.tsx` — dashboard
- `src/lib/db.ts` — table list (just check what entities exist)
- `src/app/fundraising/` directory listing — what pages exist

Note: do not exhaustively read every file. Sample 6–10 representative ones.

### Pass 2 — Design audit

Scan a few representative pages (`page.tsx` files under `src/app/fundraising/`) for:

- **Inconsistent visuals** — varying border-radius, font-sizes, color values, padding scales. Note any obvious mismatches (e.g. one page uses `borderRadius: 6`, another `borderRadius: 12` for the same kind of element).
- **Missing visual hierarchy** — pages where every element has the same weight, or where the primary action isn't visually dominant.
- **Crowded layouts** — too many controls in the filter bar, summary cards that don't have enough breathing room.
- **Mobile responsiveness** — look for `gridTemplateColumns` and `flexWrap` patterns; flag pages with rigid layouts that would break under 700px width.
- **Empty states** — pages that don't have a friendly empty state ("No donors yet — add your first one") and just show a blank table.
- **Hebrew RTL handling** — places that mix Hebrew + English text without setting `direction: "rtl"` correctly. The platform serves Hebrew-reading users; mixed-direction text without RTL hints looks broken.

### Pass 3 — Usability audit

Read the dashboard + 2–3 other major pages. Ask yourself for each:

- **Is the primary action obvious?** A donor profile page should make "+ Record payment" easy to find. A dashboard should highlight what needs attention today.
- **Are there too many clicks to do common tasks?** If charging a saved card takes 4+ clicks, that's friction.
- **Are filters discoverable?** Is there both a top-level chip strip AND per-column filtering? If only one, is it the right one for the task?
- **Are there irreversible actions without confirm?** Look for DELETE buttons without `confirm()` or warning text.
- **Is feedback after actions clear?** After saving a form, does the user see a toast/success message, or does the page just sit there?
- **Loading states** — pages that show blank for >500ms during data load without a skeleton/spinner.
- **Error states** — what happens when an API call fails? Is the message human-readable or "HTTP 500"?
- **Keyboard support** — modals that don't close on Esc, search boxes without focus on mount, etc.
- **Discoverability of new features** — does the user know about the Recycle Bin, Email Templates, Audit modals? If they're only accessible via deep menus, suggest exposing them in onboarding or empty states.

### Pass 4 — Feature gaps

Compare the current capabilities against what a typical fundraising CRM offers. Look for:

- **Reports** — what reports exist? Common gaps: donor retention rate, year-over-year giving, lapsed-donor list, top-N by lifetime value, project-level P&L.
- **Bulk operations** — is bulk edit limited to delete? Could be bulk-tag, bulk-reassign, bulk-add-to-campaign.
- **Communication history** — is every interaction (call, email, meeting) logged on the donor profile?
- **Reminders / automation** — auto-reminders for stale donors, birthday/yahrzeit notifications, follow-up cadences.
- **Integrations** — is there QuickBooks export? CSV/Excel export of pledges? PDF receipt download?
- **Hebrew calendar integration** — Hebrew birthday calc, yahrzeit auto-anniversary, parsha-of-week donor outreach.
- **Pledge mechanics** — partial payment splits, refund handling, currency conversion, multi-donor pledges (e.g. couple co-signing).
- **Donor self-service** — is there a portal where donors see their giving history, download receipts, update card on file? Big gap if not.
- **Audit log** — who edited what when? Important for nonprofits with multiple staff.
- **Donor segmentation** — saved searches/views that update as data changes ("donors who gave in 2024 but not 2025").
- **Mobile experience** — is there a mobile-optimized view for fundraisers in the field?

Note any of these that are missing AND would deliver clear value.

## Output format

Produce the report in this exact structure (in Hebrew if the user wrote in Hebrew, otherwise English):

```
## Top 3–5 quick wins (היום-יומיים, אפשר לעשות תוך שעה)

1. **[Short title]** — [1 sentence describing what + why it matters]
   * File: `path/to/file`
2. ...

## Design (עיצוב)

* **[Issue]** — [observation]. Suggested fix: [concrete action].
* ...

## Usability (נוחות שימוש)

* **[Issue]** — [observation]. Suggested fix: [concrete action].
* ...

## Features (פיצ'רים חדשים)

* **[Capability gap]** — [why this matters for a fundraising CRM]. Effort estimate: [S/M/L].
* ...

## Skip list (לא ממליץ עכשיו)

* [Things you considered but decided are low-value / out of scope]
```

## Rules of thumb

- **Concrete over vague.** "Add a spinner on the dashboard while data loads" beats "improve loading UX".
- **Reference real file paths.** Every suggestion should name the file or component it affects.
- **Tag effort.** Each suggestion gets S (under 1h), M (1 day), or L (multi-day).
- **Suggest BOTH polish AND power features.** A list of 20 small polish items is boring; a list of 20 big features is overwhelming. Mix the two.
- **Don't reinvent things that already exist.** Before suggesting "add a filter", grep for `filter` to confirm it doesn't already exist. The platform has filter chips, sort, recycle bin, email templates, audit modals — verify what's there before proposing.
- **Skip stylistic nitpicks** unless they pile up. "This page uses font-size 13, the next uses 14" alone is not interesting; "the entire app has 4 different font-size scales" is.
- **Hebrew-first** — the user is a Hebrew speaker building for a Hebrew-speaking org. RTL/Hebrew issues are first-class concerns, not afterthoughts.

## Don't

- Don't run lint or tests as part of the audit (out of scope).
- Don't propose backend refactors unless they unblock a user-visible improvement.
- Don't generate code in the audit report — just the suggestion. (User will ask separately to implement specific items.)
- Don't be exhaustive. 20 prioritized suggestions > 100 unprioritized ones.

## After delivering the report

End the report with one line:

> Tell me which numbered items you want me to implement and I'll start with the highest-priority ones.
