# Swindon Airsoft — Site Documentation

> **Live site:** [www.swindon-airsoft.com](https://www.swindon-airsoft.com)  
> **Stack:** React (Vite) · Supabase · Vercel · Square Payments

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Public Site — Pages & Features](#public-site--pages--features)
4. [Player Account Features](#player-account-features)
5. [Admin Panel — Full Guide](#admin-panel--full-guide)
6. [Super Admin (Owner Only)](#super-admin-owner-only)
7. [Database Tables](#database-tables)
8. [Edge Functions (Supabase)](#edge-functions-supabase)
9. [Environment Variables](#environment-variables)
10. [Deployment](#deployment)
11. [Key Design Decisions](#key-design-decisions)

---

## Overview

A full-stack web platform for a UK airsoft site — handling event bookings, shop orders, player registration, UKARA membership, waivers, VIP memberships, check-in, marshal scheduling, and a comprehensive admin control panel. Built with a tactical military aesthetic (acid green on black, Barlow Condensed font, clipped corners, hazard stripe accents).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (SPA, no SSR) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/password) |
| Hosting | Vercel (auto-deploy from GitHub `main`) |
| Payments | Square Web Payments SDK + Square Terminal |
| Email | Supabase Edge Functions → Resend |
| Tracking | Custom visitor intelligence (page_visits table) |
| Geo | IP-API via `geo-lookup` edge function |
| Parcel tracking | TrackingMore API via `track-parcel` edge function |

---

## Public Site — Pages & Features

### 🏠 Home
- Hero section with tactical grid background overlay
- Quick links to events, shop, UKARA
- Next upcoming event banner with player count
- News feed preview (latest 3 posts)

### 📅 Events
- Full event listings with dates, times, capacity, and price
- Walk-On and Rental ticket booking via Square payment
- Game day extras (linked to shop products)
- VIP discount (10% off) applied automatically at checkout
- Discount codes supported at checkout
- Waitlist system when events are full
- Slot hold timer (30 minutes) before slot is released
- Booking confirmation email with downloadable QR ticket
- Past events hidden from main listing

### 🛒 Shop
- Product grid with categories, variant selection (size/colour/weight etc.)
- Square payment integration
- Postage options (standard, tracked, collection)
- Sale prices, "No Post" (collection only) flag, Game+ extras flag
- Out-of-stock / low-stock labels
- Order tracking via TrackingMore (courier auto-detected)
- Order history in player profile
- Return request flow

### 📰 News & Updates
- Categorised posts: Update, Event, Safety, Community
- Full markdown rendering (bold, italic, headings, lists, blockquote, divider, links, images)
- Banner image support
- Pinned posts shown at top
- Author name shown on each post

### 🏆 Leaderboard
- Public ranking of players by games attended
- Rank badges (Recruit → Field Commander) based on game count
- Special designation badges (Ghost, Sniper, Medic, etc.)

### ❓ Q&A
- Public FAQ with admin-managed entries
- Grouped by topic

### 👥 Staff
- Staff profiles with roles and photos

### 📷 Gallery
- Photo albums with images

### 🎁 Gift Vouchers
- Purchase gift vouchers via Square
- Voucher codes redeemable at checkout

### 📋 UKARA
- UKARA membership application form
- Two-game requirement tracking
- Admin review and approval flow
- Decision emails sent to applicant

### 📞 Contact
- Contact form with department routing
- Department-specific email addresses managed in admin

### 📄 Terms
- Full site terms and conditions page

---

## Player Account Features

Players register with email/password and get access to:

### Profile Page
- **Overview** — games played, rank badge, designation, UKARA status, VIP status, joined date
- **Waiver** — annual digital waiver signing (required before booking)
- **Bookings** — upcoming and past event bookings, download/resend ticket
- **Waitlist** — current waitlist positions
- **Orders** — shop order history with parcel tracking
- **Loadout** — personal loadout/gear list (public or private)
- **VIP** — apply for VIP membership (monthly subscription, 10% discount on all bookings and shop)

### Public Profile
- Shareable public page showing rank, designation, games played, loadout

### QR Ticket
- HTML ticket file (downloadable) with QR code for gate check-in
- Booking reference number

---

## Admin Panel — Full Guide

Accessible at `/admin` to users with `role = 'admin'` or `role = 'marshal'` in the `profiles` table.

> Admin panel uses a dark tactical UI with accent green pill buttons, hazard stripe alerts, stencil labels, and a grid-background sidebar.

---

### 📊 Dashboard
- **Quick Actions** — New Event, Players, Shop Orders, Waivers, VIP Queue, Settings (Revenue shown to super admin only)
- **Next Event** banner with booking count
- **Overview stats** — Total Revenue*, Bookings, Registered Players, Unsigned Waivers, Active Events, Checked In
- **Weekly Bookings** bar chart (last 7 days)
- **Alerts** — unsigned waivers, low-stock products

*Revenue visible to super admin only*

---

### 📅 Events & Bookings

Three tabs:

**📅 Events tab**
- Create, edit, delete events
- Set: title, date, time, location, capacity (walk-on slots, rental slots), pricing
- Rich text description with markdown
- Banner image upload
- Game day extras (link shop products as add-ons)
- VIP-only events option
- Event status (draft/published/cancelled)
- View full event detail with booking summary

**📋 All Bookings tab**
- Event selector dropdown (upcoming events first, past events at bottom in red)
- Shows all bookings with: player name, event, type, qty, total, date, status
- Full action buttons per row: **View · Edit · £ Refund · Del · ⬇ Ticket · 📧 Resend**
- Ticket counts based on qty (not booking row count)

**✅ Check-In tab**
- Event selector (upcoming at top, past in red below divider)
- Search by name or paste booking ID
- One-click check-in button per player
- Progress bar showing checked-in / total tickets
- Clean view — no extra buttons (those are in All Bookings)
- QR scanner (camera) for scanning player tickets at the gate

---

### 👥 Players

- **All / Players / Admins** filter tabs
- Search by name, email, UKARA number, role
- Bulk selection (checkboxes) for bulk actions
- Per-player: edit profile, view booking history, add admin notes
- Player edit modal:
  - Name, email, date of birth, phone, address
  - Role (player / admin / marshal)
  - **🔒 CLASSIFIED** admin notes (never shown to player)
  - Rank override and Designation badge
  - **MARSHAL ACCESS** — grant QR check-in scanner access
  - VIP status (active/expired/none), UKARA status
  - Account deletion request flag
- Waiver management per player

---

### 🛒 Shop

Three tabs:

**Products tab**
- Card-based product list (no horizontal scrolling)
- Categories with collapsible sections — drag category headers to reorder
- Each card shows: thumbnail, name, flags (HIDDEN / SALE / NO POST / GAME+ / VARIANTS), price, stock level with colour bar
- **⚠ Low Stock banner** at top — lists any product/variant ≤5 units in red/amber, click to jump to edit
- Click a variant product card to expand per-variant breakdown (Name / Sell / Stock)
- Drag products within a category to reorder
- **Product edit modal**: name, category, description (markdown), images, price, sale price, stock, variants (name/price/stock), No Post flag, Game+ flag, Hidden flag

**Postage Options tab**
- Create/edit postage options (name, price, description, active flag)

**Orders tab** (see [Orders](#orders) section)

---

### 📦 Orders

Smart grouped filter tabs:
- **Needs Action** — pending + return requests (glows red when urgent)
- **In Progress** — processing + dispatched
- **Completed** — completed, cancelled, refunded
- **All Orders** — everything

Features:
- Hazard stripe banner when return requests need attention
- Stats bar: total orders, needs action, dispatched, returns
- Order rows colour-coded: pending = blue tint, return requested = red tint
- Contextual quick-action buttons per order state:
  - `pending` → **▶ Process** + **📦 Dispatch**
  - `processing` → **📦 Dispatch**
  - `return_requested` → **✓ Approve** + **✗ Reject**
  - `dispatched` → **✓ Complete**
  - all → **Details**
- Orders auto-refresh every 30 seconds
- Sidebar badge counts all incomplete orders (pending/processing/dispatched/return_requested), clears on completion

---

### 📰 News & Updates

- Post list as styled cards with banner thumbnail, category icon, colour-coded left border
- **Editor** features:
  - Formatting toolbar: **B** *I* H2 H3 • 1. ❝ — 🔗 📷 — click to insert at cursor
  - Banner image: drag-and-drop upload OR paste URL
  - Live preview mode (renders markdown with full styling)
  - Category selector (Update / Event / Safety / Community) with emoji icons
  - Published / Pinned toggles
- Categories colour-coded: blue=update, green=event, red=safety, gold=community

---

### 🎖 Waivers

- List of players who have not signed the current year's waiver
- Send reminder emails
- Manual waiver override

---

### 🪖 VIP Queue

- Pending VIP applications
- Approve or deny with email notification

---

### 🏆 Leaderboard Admin

- Edit player game counts, rank overrides, and designation badges
- Manual points adjustment

---

### 📡 Visitor Intelligence

Four tabs:

**Overview** — total visits, unique visitors, logged-in vs anonymous, live viewer count (pulsing dot), weekly trend chart, alerts

**Pages** — visits per page, share bar chart

**Locations** — by country and city, interactive map with pin clusters (green = UK, blue = international), click pin for session/player breakdown

**Users** — logged-in player visit history, visit count per page, last seen

- Date range filter: 24H / 7D / 30D / 90D / ALL
- Bot/crawler traffic automatically filtered
- Anonymous visitors tracked by session ID, promoted to user on login

---

### 🏅 Marshal Schedule

- Create marshal schedules for game days
- Assign marshals to roles
- Marshals see their own schedule on the Marshal Schedule page

---

### 💬 Messages & Contact

- Site-wide announcement banner management
- Social links (Facebook, Instagram, etc.)
- Contact department configuration (name, email, description)

---

### 📧 Email Test

- Send test emails for all email templates (booking confirmation, ticket, order confirmation, etc.)

---

### 💰 Cash Sales *(admin)*

- Record in-person cash sales (walk-ons, extras, shop items)
- Feeds into revenue reports

---

### 🎟 Discount Codes

Two tabs:
- **Codes** — create/edit codes (%, fixed amount, per-user limit, expiry)
- **Redemption History** — who used which code and when

---

### 🎁 Gift Vouchers

- View all issued gift vouchers
- Check balance, status, who it was issued to

---

### 🖼 Gallery

- Create albums, upload images
- Manage public visibility

---

### 🛡 UKARA Applications

Two tabs:
- **Pending** — applications awaiting review (approve / reject with email)
- **Approved** — searchable list of approved players

---

### ⚙️ Settings

- **Tracking API Key** — TrackingMore API key for parcel tracking
- **Square Configuration** — App ID, Location ID, Environment (sandbox/production), Terminal Device ID
- **Shop Open/Closed** — toggle to close the shop for all customers

---

## Super Admin (Owner Only)

Restricted to `c-pullen@outlook.com` only. Additional access:

- **💰 Revenue** — full revenue report (booking revenue, shop revenue, by period, by event)
- **📋 Audit Log** — every admin action logged with who, what, when, and what changed

---

## Database Tables

| Table | Purpose |
|---|---|
| `profiles` | Player accounts (name, email, role, UKARA, VIP, waiver, rank) |
| `events` | Game day events (date, capacity, pricing, extras, bookings JSON) |
| `bookings` | Individual event bookings (player, qty, type, extras, Square order) |
| `event_waitlist` | Waitlist entries per event |
| `waitlist_holds` | Temporary slot holds (30-min timer) |
| `event_extras` | Add-on products linked to events |
| `shop_products` | Shop products (variants JSON, images, stock, pricing) |
| `shop_orders` | Shop orders (items, postage, Square order, status, tracking) |
| `postage_options` | Postage methods and pricing |
| `discount_codes` | Discount code definitions |
| `discount_code_redemptions` | Usage log per code/user |
| `gift_vouchers` | Gift voucher codes and balances |
| `news_posts` | Public news articles |
| `qa_items` | Q&A entries |
| `staff` | Staff member profiles |
| `gallery_albums` | Photo gallery albums |
| `gallery_images` | Gallery images |
| `player_loadouts` | Player gear/loadout lists |
| `marshal_schedules` | Marshal game day schedule data |
| `ukara_applications` | UKARA membership applications |
| `page_visits` | Visitor analytics (one row per user+page pair) |
| `site_settings` | Key-value site configuration (Square keys, etc.) |
| `admin_audit_log` | Admin action audit trail |
| `cheat_reports` | Player cheat/conduct reports |
| `cash_sales` | In-person cash sale records |
| `public_profiles` | Public-facing profile view |
| `push_subscriptions` | Browser push notification subscriptions |
| `failed_payments` | Square payment failure records |

---

## Edge Functions (Supabase)

| Function | Purpose |
|---|---|
| `square-payment` | Process Square card payments |
| `square-refund` | Issue Square refunds |
| `square-webhook` | Handle Square payment webhooks (order completion) |
| `square-terminal` | Square Terminal (in-person card reader) payments |
| `square-catalog-sync` | Sync products to Square catalog |
| `square-customer-sync` | Sync player profiles to Square customers |
| `geo-lookup` | IP geolocation via ip-api.com (used by visitor tracking) |
| `track-visit` | Record page visit to page_visits table |
| `track-parcel` | Fetch parcel tracking status from TrackingMore |
| `notify-booking` | Send booking confirmation email via Resend |
| `delete-user` | Hard-delete a player account and all data |
| `xero-auth-callback` | Xero accounting OAuth callback |
| `xero-sale` | Push sale data to Xero |

---

## Environment Variables

Stored in Vercel project settings. Copy `env.example` for local development.

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Square keys, TrackingMore API key, and other sensitive config are stored in the **`site_settings`** table in Supabase (editable via Admin → Settings), not in environment variables — this allows updating keys without redeploying.

---

## Deployment

The site auto-deploys on every push to `main` via Vercel's GitHub integration.

```bash
# Local development
npm install
npm run dev

# Production build (runs automatically on Vercel)
npm run build
```

**Manual deploy flow:**
1. Make changes to code
2. `git add . && git commit -m "message"`
3. `git push origin main`
4. Vercel detects the push, builds in ~30 seconds, and promotes to production

No manual steps needed. Supabase edge functions are deployed separately via the Supabase dashboard or CLI.

---

## Key Design Decisions

**One row per user+page in `page_visits`**  
Visitor tracking stores one row per `(user_id, page)` pair (or `session_id, page` for anonymous). This gives accurate per-page visit counts rather than collapsing all visits into one row. Anonymous rows are promoted to user rows on login.

**RLS on all tables**  
Row Level Security is enabled on every table. Anonymous visitors can INSERT page visits but not read them. Only admins can read analytics data.

**Square over Stripe**  
Square is used for both online card payments and in-person Terminal payments, keeping all financial data in one platform. Square webhooks handle order completion asynchronously.

**Ticket qty vs booking rows**  
A booking has a `qty` field (e.g. Matt books 2 walk-on slots = 1 booking row, qty=2). All counts in the admin display ticket totals (sum of qty) not booking row counts.

**Super admin restriction**  
Revenue reports and the audit log are restricted to a hardcoded super-admin email (`c-pullen@outlook.com`) at the component level, in addition to the normal `role = 'admin'` check.

**Session-based auth refresh on save**  
Before any admin save operation, `supabase.auth.getSession()` is called to refresh the JWT. This prevents silent save failures when an admin switches browser tabs and the token expires.

**tabBtn utility**  
All admin tab buttons use a shared `src/admin/tabBtn.js` helper for consistent pill-style styling (clipped corners, accent active state). Kept in its own file to avoid Rollup dynamic-import conflicts with the main `utils.jsx`.
