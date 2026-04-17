Swindon Airsoft — Developer README
Overview
Swindon Airsoft is a full-stack React web application for managing an airsoft venue. It handles event booking, a shop with order fulfilment, player profiles, UKARA registration, VIP membership, gift vouchers, staff management, and a comprehensive admin panel.
Stack: React 18 + Vite · Supabase (database, auth, edge functions, storage) · Square Web Payments · EmailJS · Vercel (hosting)
---
Tech Stack
Layer	Technology
Frontend	React 18 (JSX), Vite 5
Hosting	Vercel (auto-deploys from GitHub `main`)
Database	Supabase (PostgreSQL + Row Level Security)
Auth	Supabase Auth (email/password)
Payments	Square Web Payments SDK + Edge Functions
Email	EmailJS (transactional emails)
Parcel tracking	TrackingMore API
Fonts	Barlow Condensed, Share Tech Mono (Google Fonts)
---
Repository Structure
```
swindon-airsoft/
├── index.html                  ← Entry HTML, meta tags, font imports
├── src/
│   ├── main.jsx                ← React root mount
│   ├── App.jsx                 ← ErrorBoundary wrapper (25 lines)
│   ├── AppInner.jsx            ← Routing, auth state, cart, footer (~649 lines)
│   ├── supabaseClient.js       ← Supabase client initialisation
│   ├── api.js                  ← All Supabase API calls (events, shop, profiles etc.)
│   │
│   ├── assets/
│   │   └── logoImage.js        ← SA_LOGO_SRC — base64 encoded PNG logo
│   │
│   ├── utils/                  ← Shared helpers, hooks, UI components, emails
│   │   ├── index.js            ← Barrel re-export (import anything via "./utils")
│   │   ├── helpers.jsx         ← renderMd, stockLabel, fmtErr, date helpers, uid
│   │   ├── css.js              ← Global CSS string (injected by AppInner)
│   │   ├── squareConfig.jsx    ← Square SDK loader + SquareCheckoutButton
│   │   ├── shopifyConfig.js    ← Shopify stubs (kept for import compatibility)
│   │   ├── useData.js          ← Primary data hook — loads all app data from Supabase
│   │   ├── tracking.jsx        ← Parcel tracking: TrackingMore API, UI cells
│   │   ├── hooks.js            ← useMobile, useToast
│   │   ├── ui.jsx              ← SkeletonCard, Toast, GmtClock, Countdown
│   │   ├── qrComponents.jsx    ← QRCode display + QRScanner (camera)
│   │   ├── auth.jsx            ← SupabaseAuthModal, WaiverModal
│   │   ├── nav.jsx             ← PublicNav (top nav, mobile drawer, bottom nav)
│   │   ├── home.jsx            ← HomePage, CountdownPanel
│   │   ├── email.js            ← All send*Email functions + EmailJS constants
│   │   └── insignia.jsx        ← RankInsignia, DesignationInsignia SVG components
│   │
│   ├── pages/                  ← Public-facing page components
│   │   ├── EventsPage.jsx      ← Event listing, detail, booking, waitlist
│   │   ├── ShopPage.jsx        ← Shop, product detail, cart, checkout
│   │   ├── ProfilePage.jsx     ← Player profile, waiver, orders, loadout, settings
│   │   ├── PublicProfilePage.jsx ← Public player profile view
│   │   ├── LoadoutTab.jsx      ← Loadout manager (used inside ProfilePage)
│   │   ├── ReportCheatTab.jsx  ← Hit-call reporting (used inside ProfilePage)
│   │   ├── PlayerOrders.jsx    ← Order history + return requests
│   │   ├── LeaderboardPage.jsx ← Player leaderboard
│   │   ├── GalleryPage.jsx     ← Photo gallery
│   │   ├── VipPage.jsx         ← VIP membership signup & status
│   │   ├── QAPage.jsx          ← FAQ / site rules accordion
│   │   ├── GiftVoucherPage.jsx ← Buy & redeem gift vouchers
│   │   ├── MarshalCheckinPage.jsx ← Marshal QR check-in tool
│   │   ├── UKARAPage.jsx       ← UKARA registration application
│   │   ├── AboutPage.jsx
│   │   ├── StaffPage.jsx
│   │   ├── ContactPage.jsx
│   │   ├── PlayerWaitlist.jsx
│   │   └── TermsPage.jsx
│   │
│   └── admin/                  ← Admin panel components (role-gated)
│       ├── AdminPanel.jsx      ← Sidebar shell + section routing (~224 lines)
│       ├── adminHelpers.js     ← diffFields, logAction (shared across admin)
│       ├── AdminDash.jsx       ← Dashboard overview with stats
│       ├── AdminEventsBookings.jsx ← Events + bookings management
│       ├── AdminPlayers.jsx    ← Player management, VIP, UKARA, card status
│       ├── AdminOrders.jsx     ← Order fulfilment, dispatch, returns
│       ├── AdminShop.jsx       ← Shop product management
│       ├── AdminWaivers.jsx    ← Waiver review
│       ├── AdminUkaraApplications.jsx ← UKARA applications review
│       ├── AdminDiscountCodes.jsx
│       ├── AdminGiftVouchers.jsx
│       ├── AdminRevenue.jsx
│       ├── AdminGallery.jsx
│       ├── AdminQA.jsx
│       ├── AdminStaff.jsx
│       ├── AdminContactDepts.jsx
│       ├── AdminPurchaseOrders.jsx
│       ├── AdminSettings.jsx   ← Square config, site settings, email config
│       ├── AdminMessages.jsx
│       ├── AdminCash.jsx
│       ├── AdminVisitorStats.jsx
│       ├── AdminAuditLog.jsx
│       ├── AdminLeaderboard.jsx
│       ├── AdminCheatReports.jsx
│       ├── AdminFailedPayments.jsx
│       └── EmailTestCard.jsx
│
├── public/
│   ├── favicon.svg
│   └── favicon.ico
├── vite.config.js
└── package.json
```
---
How Routing Works
The app uses hash-based routing — no React Router, no server-side routing. Everything runs from a single `index.html`.
Hash	Page
`#home`	Home page (default)
`#events`	Events listing
`#events/:id`	Event detail
`#shop`	Shop
`#profile`	Player profile
`#profile/:tab`	Profile with specific tab open
`#player/:userId`	Public player profile
`#ukara`	UKARA registration
`#vip`	VIP membership
`#leaderboard`	Leaderboard
`#gallery`	Gallery
`#qa`	FAQ / rules
`#gift-vouchers`	Gift vouchers
`#about`, `#staff`, `#contact`, `#terms`	Info pages
`#admin`	Admin panel (redirects to `#admin/dashboard`)
`#admin/:section`	Admin section
`#admin/:section/:tab`	Admin section + tab
All routing state lives in `AppInner.jsx`. The `setPage()` function updates both React state and `window.location.hash` simultaneously.
---
Data Loading
All Supabase data is loaded by the `useData` hook (`src/utils/useData.js`). It:
Loads events, shop products, postage options, gallery, Q&A, staff, and site settings in a single parallel fetch on mount
Retries up to 3 times with increasing delays to handle Supabase cold starts
Reloads when the browser tab becomes visible after 30+ seconds hidden
Re-validates the Supabase auth session after 5+ minutes hidden
Exposes `save()`, `updateUser()`, `updateEvent()`, and `refresh()` for mutations
The `data` object shape:
```js
{
  events: [],        // with nested bookings[]
  shop: [],          // with variants[]
  postageOptions: [],
  albums: [],
  qa: [],
  staff: [],
  users: [],         // profiles (authenticated) or public subset (guest)
  homeMsg: "",
  socialFacebook: "", socialInstagram: "", socialWhatsapp: "",
  contactAddress: "", contactPhone: "", contactEmail: "",
  shopClosed: false,
}
```
---
Authentication
Auth is handled by Supabase Auth via the `SupabaseAuthModal` component (`src/utils/auth.jsx`). On login, the user's profile is fetched from the `profiles` table and normalised into camelCase via `normaliseProfile()` in `api.js`.
Roles: `player` · `admin` · `staff`
Admin access is checked in `AppInner.jsx` — users with `role === "admin"` see the admin nav item and can access `#admin/*` routes.
---
Payments
Payments use the Square Web Payments SDK, loaded dynamically from CDN. Configuration (App ID, Location ID, environment) is stored in Supabase `site_settings` and loaded at runtime via `loadSquareConfig()`.
`sandbox` mode shows a mock payment button — no real money taken
`production` mode loads the real Square card widget with 3DS/SCA support
Failed payments are logged to the `failed_payments` table
The actual charge happens via a Supabase Edge Function (`square-payment`)
To switch between sandbox and production: Admin → Settings → Square Configuration
---
Email
All transactional emails are sent via EmailJS. The service ID, template ID, and public key are constants in `src/utils/email.js`.
Email functions available:
`sendTicketEmail` — booking confirmation to player
`sendEventReminderEmail` — reminder blast to all bookers
`sendWelcomeEmail` — new account welcome
`sendOrderEmail` — shop order confirmation
`sendDispatchEmail` — dispatch notification with tracking
`sendCancellationEmail` — booking cancellation
`sendWaitlistNotifyEmail` — waitlist slot available
`sendNewEventEmail` — new event announcement blast
`sendAdminBookingNotification` — admin alert: new booking
`sendAdminOrderNotification` — admin alert: new order
`sendAdminReturnNotification` — admin alert: return request
`sendAdminUkaraNotification` — admin alert: UKARA application
`sendUkaraDecisionEmail` — UKARA approved/declined to player
`sendReturnDecisionEmail` — return approved/rejected to player
---
Parcel Tracking
Parcel tracking uses the TrackingMore v4 API. The API key is stored in Supabase `site_settings` under `trackingmore_api_key`.
Tracking status is cached in `localStorage` per tracking number:
Final statuses (Delivered, Expired): cached for 8 hours
In-progress statuses: cached for 30 minutes
Supported couriers: Royal Mail, UPS, FedEx, DPD, Evri, Parcelforce (auto-detected from tracking number format).
---
Admin Panel
The admin panel lives at `#admin` and is only accessible to users with `role === "admin"`. The sidebar shell is in `src/admin/AdminPanel.jsx` — it imports all sub-panels and routes between them.
Key sections:
Section	What it does
Dashboard	Stats overview, quick links
Events & Bookings	Create/edit events, manage bookings, check in players, issue refunds
Players	Player profiles, VIP status, card status (green/amber/red/black), UKARA
Orders	Fulfilment queue, dispatch, return requests, refunds
Shop	Product/variant management, stock levels
UKARA Applications	Review applications, approve/decline, set expiry
Revenue	Revenue charts by period
Discount Codes	Create and manage discount codes
Settings	Square config, site settings, social links, contact details
Audit Log	Full log of all admin actions
Return requests show as a red alert banner at the top of the Orders section when any are pending. Clicking it jumps straight to the Return Requested tab.
Audit logging — every significant admin action is written to the `audit_log` table via `logAction()` in `src/admin/adminHelpers.js`.
---
Environment & Deployment
The app is deployed on Vercel and auto-deploys on every push to `main` on GitHub.
No environment variables are needed in Vercel — all runtime configuration (Supabase URL/key, Square keys, EmailJS keys, TrackingMore key) is either hardcoded in the client or loaded from Supabase `site_settings` at runtime.
Deployment workflow
```
Edit code → Push to GitHub (main) → Vercel auto-builds → Live in ~60s
```
If a build fails, check the Vercel build logs. Common issues:
Duplicate imports (same name imported twice in one file)
`.js` file containing JSX (rename to `.jsx`)
Wrong relative import path (admin files must use `../utils` not `./utils`)
Local development
```bash
npm install
npm run dev
```
Requires a `src/supabaseClient.js` with valid Supabase URL and anon key.
---
Import Conventions
All shared utilities can be imported from `"../utils"` (or `"./utils"` from root-level files) thanks to the barrel export in `src/utils/index.js`:
```js
// From any page or admin file:
import { renderMd, useData, sendEmail, useMobile, SquareCheckoutButton } from "../utils";

// From AppInner.jsx (root level):
import { CSS, useData, HomePage, PublicNav } from "./utils";
```
Admin-specific helpers:
```js
import { diffFields, logAction } from "./adminHelpers";
```
---
Key Supabase Tables
Table	Purpose
`profiles`	Player profiles (extends Supabase auth users)
`events`	Game day events
`bookings`	Event bookings (nested under events)
`shop_products`	Shop items with variants
`shop_orders`	Customer orders
`postage_options`	Postage/delivery options
`gallery_albums`	Photo gallery
`qa_items`	FAQ / site rules
`staff_members`	Staff profiles
`site_settings`	Key/value config store
`discount_codes`	Discount codes + redemptions
`gift_vouchers`	Gift voucher balances
`ukara_applications`	UKARA registration applications
`waitlist`	Event waitlist entries
`audit_log`	Admin action log
`failed_payments`	Failed payment log
`page_visits`	Visitor analytics
`cheat_reports`	Player hit-call reports
`cash_takings`	Cash sales log
`purchase_orders`	Stock purchase orders
---
Files You Should Never Edit Directly on GitHub
These files are auto-managed or contain sensitive credentials:
`src/assets/logoImage.js` — large base64 file, edit via admin tools only
`src/supabaseClient.js` — contains Supabase URL and anon key
`package-lock.json` — managed by npm
---
Codebase Size
Folder	Files	Lines
`src/` (root)	2	~674
`src/utils/`	15	~3,881
`src/pages/`	19	~8,120
`src/admin/`	26	~10,588
Total	62	~23,186
