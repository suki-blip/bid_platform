# BidMaster Admin Panel — Software Requirements Specification

## Overview

The admin panel is a **SaaS management dashboard** for BidMaster's platform operator. It manages **paying users (contractors)**, their subscriptions, payments, and account statuses. This is NOT a per-project admin — it's the business-level control panel for the entire BidMaster SaaS.

## Design System

- **Fonts**: Bricolage Grotesque (headings, 900/800/700), Plus Jakarta Sans (body, 400-700)
- **Color Palette**:
  - Ink: `#0f0f0f` (sidebar bg, primary text)
  - Surface: `#ffffff`, Background: `#f5f5f3`, Border: `#e5e7eb`
  - Gold/Brand: `#d97706` (active nav, CTAs, badges)
  - Semantic: Green `#16a34a` (active/paid), Red `#dc2626` (unpaid/failed), Blue `#2563eb` (trial/info), Orange `#ea580c` (suspended/warning)
- **Layout**: Fixed sidebar (220px, dark) + main content area with topbar

## Navigation Structure

### Sidebar (Dark, `#0f0f0f`)
- **Logo**: "BidMaster" with "Admin Panel" subtitle
- **Main Section**:
  - Dashboard (📊)
  - Users (👥) — with badge showing unpaid count
  - Payments (💳)
  - Send Message (✉️)
- **System Section**:
  - Activity Log (📋)
  - Settings (⚙️)
- **Bottom**: Admin profile pill (avatar + name + role)

### Topbar
- Page title + subtitle
- Right: Primary action button (e.g., "+ Add User")

---

## Pages & Features

### 1. Dashboard

**KPI Cards** (4-column grid):
| KPI | Icon | Color | Description |
|-----|------|-------|-------------|
| Total Users | 👥 | Blue bg | All registered users |
| Active Paying | ✅ | Green bg | Users with active paid subscriptions |
| Unpaid | ⚠️ | Red bg | Users with failed/overdue payments |
| MRR | 💰 | Gold bg | Monthly Recurring Revenue ($) |

**Two-Column Layout Below KPIs**:
- **Left: "Unpaid — Needs Action"** table
  - Shows unpaid users with avatar, name, email, status tag, "Remind" button
  - Clicking user row opens User Detail modal
- **Right: "Recent Activity"** feed
  - Color-coded dots (green=payment, blue=signup, red=failed, orange=suspended)
  - Each entry: bold name + action text + relative timestamp

### 2. Users Page

**Bulk Action Bar** (appears when users selected):
- Shows count of selected users
- Actions: Suspend, Activate, Message, Clear selection

**Users Table** with:
- **Search**: Real-time search by name or email
- **Filter Chips**: All | Active | Trial | Unpaid | Suspended (toggle style)
- **Columns**: Checkbox | User (avatar + name + company) | Email | Status | Payment | Joined | Actions
- **Status Tags**: Active (green), Trial (blue), Suspended (orange)
- **Payment Tags**: Paid (green), Unpaid (red), Trial (blue)
- **Row Actions**: Suspend/Activate toggle button
- **Row Click**: Opens User Detail modal

**User Detail Modal**:
- User name, status + payment tags
- Info grid: Company, Email, Plan, Last Login, Joined
- Actions: Suspend/Activate, Send Reminder (if unpaid), Change Password, Send Message

### 3. Payments Page

**KPI Cards** (3-column grid):
| KPI | Description |
|-----|-------------|
| This Month ($) | Total revenue current month |
| Failed / Unpaid ($) | Outstanding/failed payment amount |
| Paying Users | Count of active paying users |

**Payment History Table**:
- Columns: User | Date | Amount | Status | Action
- Status: Paid (green tag) / Failed (red tag)
- Actions: "Remind" for failed, "Invoice" for paid

### 4. Send Message Page

**Two-Column Layout**:

**Left — Compose**:
- **Recipients**: Chip selector — All Users, Active, Trial, Unpaid, Suspended, Custom
  - Custom mode: search users by name/email, add as tags with remove button
- **Subject**: Text input
- **Message Body**: Textarea with template variables support (`{{name}}`, `{{email}}`, `{{plan}}`)
- **Actions**: Preview | Send Message

**Right — Templates & History**:
- **Message Templates** (pre-built):
  - Payment Reminder
  - Suspension Warning
  - Welcome Message
  - Reactivation Offer
- **Last Sent**: Recent messages with recipient count and timestamp

### 5. Activity Log

**Feed Table**:
- Color-coded dots by event type
- Event types: payment received, signup, payment failed, account suspended, password changed, message sent, account activated
- Each entry: event description + relative timestamp

### 6. Settings

**Admin Configuration**:
- Admin Email
- Notification Email
- Auto-suspend after unpaid (days) — default: 14
- Auto-reminder before suspension (days) — default: 3
- Save button

---

## Modals

### Add User Modal
- Fields: Full Name*, Company, Email*, Password* (min 8 chars), Plan (Trial 14-day / Pro $199/mo)
- Creates account and logs activity

### User Detail Modal
- Displays user info in card grid
- Action buttons based on status (Activate/Suspend, Send Reminder, Change Password, Send Message)

### Change Password Modal
- New Password (min 8 chars) + Confirm Password
- Validates match, logs activity

---

## User Data Model

```
User {
  id: string
  name: string
  company: string
  email: string
  status: 'active' | 'trial' | 'suspended'
  payment: 'paid' | 'unpaid' | 'trial'
  plan: 'Pro' | 'Trial'
  joined: date
  lastLogin: date/relative
}
```

## Payment Data Model

```
Payment {
  user: string (user name)
  date: date
  amount: number (e.g. 199)
  status: 'paid' | 'failed'
}
```

## Activity Log Entry

```
ActivityEntry {
  type: 'payment' | 'signup' | 'failed' | 'suspend' | 'activate' | 'login' | 'message' | 'admin'
  text: string
  time: relative timestamp
  color: semantic color
}
```

---

## Key Interactions

1. **Filter + Search**: Users page combines chip filters with search — both applied simultaneously
2. **Bulk Select**: Checkbox per row + "Select All" header checkbox, triggers bulk action bar
3. **Inline Actions**: Suspend/Activate buttons directly in table rows
4. **Quick Navigation**: User modal → "Send Message" button navigates to Messages page with user pre-loaded as recipient
5. **Template Loading**: Click template → auto-fills subject + body in compose form
6. **Toast Notifications**: Bottom-right toast for all confirmations (3s auto-dismiss)
7. **Payment Reminders**: Clickable from Dashboard unpaid list, User modal, or Payments table

## Design Notes

- All tables have hover states on rows (`background: var(--bg)`)
- Cards use `border: 1.5px solid var(--border)` with `border-radius: 12px`
- Buttons: `btn-gold` (primary), `btn-outline` (secondary), `btn-red` (danger), `btn-green` (success)
- Tags are pill-shaped (`border-radius: 100px`) with semantic bg + border + text color
- Sidebar active item uses gold background with black text
- Modals have overlay (`rgba(0,0,0,0.45)`), close on outside click, close button top-right

---

## Non-Functional Requirements

### Performance
- Page load time under 1 second
- User table filtering and search: real-time, under 100ms
- All UI interactions (modals, navigation): instant feedback

### Security
- Admin panel accessible only to authenticated super admin
- All passwords must be minimum 8 characters
- Session timeout after period of inactivity
- All API calls over HTTPS
- No sensitive data stored in browser localStorage

### Usability
- Clean, professional interface consistent with BidMaster design system
- All actions provide visual feedback via toast notifications
- Destructive actions (suspend, delete) require confirmation
- Color-coded status indicators throughout

### Technology
- Production: Node.js backend (Next.js) + Turso database + Stripe billing (future)
- Fonts: Bricolage Grotesque (display) + Plus Jakarta Sans (body)
- Design system: CSS variables, consistent component library

---

## Pending Backend Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| 01 | Backend API integration | High |
| 02 | Real email sending via Resend | High |
| 03 | Authentication: admin login page with secure session | High |
| 04 | Real-time data from database (users, payments) | High |
| 05 | Stripe webhook integration for automatic payment status updates | High |
| 06 | Automatic account suspension after X days unpaid | High |
| 07 | Automated payment reminder emails on schedule | High |
| 08 | Export user list to CSV / Excel | Medium |
| 09 | Two-factor authentication (2FA) for admin | Medium |
| 10 | Mobile responsive layout | Medium |
| 11 | Pagination for large user lists (100+) | Medium |
| 12 | Advanced filters: date range, plan type, payment date | Low |
| 13 | Admin audit log: full history of all admin actions with timestamp | Medium |
