# Swindon Airsoft — Deployment Guide
# Supabase (database) + Vercel (hosting)

---

## STEP 1 — Set up Supabase (your database)

1. Go to https://supabase.com and click **Start for free**
2. Sign up, then click **New project**
   - Name: `swindon-airsoft`
   - Database password: choose something strong and **save it**
   - Region: `West EU (London)`
3. Wait ~2 minutes for the project to spin up

### Run the database schema

4. In your Supabase project, click **SQL Editor** in the left sidebar
5. Click **New query**
6. Open the file `supabase/schema.sql` from this folder, copy ALL of it, paste into the editor
7. Click **Run** — you should see "Success. No rows returned"
8. Click **New query** again
9. Open `supabase/storage.sql`, copy ALL of it, paste, click **Run**

### Create your admin account

10. In Supabase, go to **Authentication → Users → Add user**
    - Email: your email (e.g. `admin@swindonairsoft.co.uk`)
    - Password: something secure
    - Click **Create user**
11. Go to **Table Editor → profiles**, find your new user row
12. Click the row to edit it, change `role` from `player` to `admin`, click **Save**

### Get your API keys

13. Go to **Settings → API** (left sidebar)
14. Copy these two values — you'll need them shortly:
    - **Project URL** (looks like `https://abcdef.supabase.co`)
    - **anon public** key (long string starting with `eyJ...`)

---

## STEP 2 — Put the code on GitHub

1. Go to https://github.com and sign in (or create a free account)
2. Click **+** → **New repository**
   - Name: `swindon-airsoft`
   - Private: yes (recommended)
   - Click **Create repository**
3. On your computer, open a terminal in the folder containing this README
4. Run these commands one by one:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/swindon-airsoft.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your actual GitHub username.

---

## STEP 3 — Deploy to Vercel (your website host)

1. Go to https://vercel.com and click **Sign up** — choose **Continue with GitHub**
2. Click **Add New → Project**
3. Find `swindon-airsoft` in the list, click **Import**
4. In the **Environment Variables** section, add these two:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | Your Supabase Project URL from Step 1 |
   | `VITE_SUPABASE_ANON_KEY` | Your anon public key from Step 1 |

5. Leave everything else as default — Vercel auto-detects Vite
6. Click **Deploy**
7. Wait ~1 minute — Vercel will give you a live URL like `swindon-airsoft.vercel.app`

---

## STEP 4 — Set up email confirmation (Supabase)

By default Supabase sends a confirmation email when users register.

1. In Supabase → **Authentication → Email Templates**
   - Customise the "Confirm signup" email with your branding
2. In **Authentication → URL Configuration**
   - Add your Vercel URL to **Site URL**: `https://swindon-airsoft.vercel.app`

---

## STEP 5 — Custom domain (optional)

If you have a domain (e.g. `swindonairsoft.co.uk`):

1. In Vercel → your project → **Settings → Domains**
2. Click **Add**, type your domain
3. Vercel will show you DNS records to add with your domain registrar
4. After DNS propagates (~24hrs), your site will be live on your domain

---

## FUTURE UPDATES

Whenever you make changes to the code:

```bash
git add .
git commit -m "Describe your change"
git push
```

Vercel automatically redeploys within ~60 seconds — no manual steps needed.

---

## TROUBLESHOOTING

**White screen after deploy**
→ Check Vercel → your project → **Deployments** → click the deployment → **View logs**
→ Most likely cause: missing or wrong environment variables

**"Email already registered" but can't log in**
→ Go to Supabase → Authentication → Users, find the user, click **Send magic link** to reset

**Bookings not saving**
→ Check Supabase → Table Editor → bookings to confirm data is arriving
→ Check RLS policies are enabled (SQL Editor: `select * from pg_policies`)

**Images not uploading**
→ Confirm the `images` storage bucket exists: Supabase → Storage
→ Check the storage.sql policies were applied

---

## WHAT'S INCLUDED

- ✅ Full Supabase PostgreSQL database with all tables
- ✅ Row Level Security (players only see their own data)
- ✅ Supabase Auth (email/password registration + login)
- ✅ Image storage via Supabase Storage (profile pics, banners, shop images, gallery)
- ✅ Auto-deploy on every git push via Vercel
- ✅ All previous features: events, bookings, waivers, shop, QR check-in, leaderboard, etc.
