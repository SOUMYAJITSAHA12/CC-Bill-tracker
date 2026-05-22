# CC Bill Tracker

Self-hosted credit-card bill tracker. Fetches statements directly from BillDesk's hexagon InstaPay API (no Selenium, no browser), stores them in Supabase, and surfaces them through a Next.js dashboard.

- **UI**: Next.js 15 (App Router) on [Vercel](https://vercel.com) (free)
- **DB + Auth**: [Supabase](https://supabase.com) (free) — email + password
- **Fetch**: Pure HTTP to `hexagon.billdesk.com/hgapp-instapay/InstaPayController` (reverse-engineered AES-GCM crypto). Run via **GitHub Actions** twice daily or on demand from the dashboard with live progress.

Originally inspired by [SOUMYAJITSAHA12/CC-Bill-tracker](https://github.com/SOUMYAJITSAHA12/CC-Bill-tracker) (Selenium + Telegram). This rewrite replaces the headless browser with a typed BillDesk API client and adds a real UI.

> Personal/household use only. Automating consumer bill portals may violate their terms — you are responsible for compliance.

## What's in the box

- **Dashboard** with column-header filters (status / profile / bank), inline spinners on every async action, and a live progress bar for batch fetches that streams per-card updates over NDJSON.
- **BillDesk client** (`lib/billdesk/`) implementing `NLIINIT` → `NLIBILLERS` → `NLIVALIDATEPAYMENT` with AES-GCM `REQDATA`/`RESDATA`. Per-biller rate-limit handling: ICICI gets a fresh session per card and exponential back-off; other billers reuse one session for speed.
- **Multi-user**: email + password sign-in, per-user household isolation via Supabase RLS. Optional dev bypass with `SKIP_AUTH=true`.
- **Bill lifecycle**: tracks UNPAID / PARTIAL / PAID, remembers manually-marked-paid cycles so the next fetch doesn't reopen them, and surfaces UPI QR pay for Axis & ICICI credit cards.
- **Setup scripts**: `seed:users` (creates two static accounts), `migrate:cards` (claims orphan data from the `SKIP_AUTH=true` days into a real user's household).
- **GitHub Actions** workflow that runs the batch fetch on cron — no Vercel timeout, free.

## Quick start

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste and run `supabase/schema.sql`. This creates the `households`, `household_members`, `cards`, `bills`, `card_profiles`, and `fetch_log` tables plus the RLS policies for per-household isolation.
3. **Authentication → Providers → Email**: Enable.
4. **Authentication → Settings**:
   - "Confirm email" **OFF** → users can sign in immediately after sign-up (recommended for self-hosted personal use).
   - "Confirm email" **ON** → users must click the confirmation link first.
5. **Authentication → URL Configuration**:
   - Site URL = `http://localhost:3000` for dev (and your Vercel URL in prod).
   - Redirect URLs include `/auth/callback`.
6. **Project Settings → API**: copy **Project URL**, **anon key**, and **service_role key**.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the Supabase keys. Generate a strong `FETCH_CRON_SECRET`:

```bash
openssl rand -hex 32
```

Key vars:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Batch fetch writes (bypasses RLS) — also required for the seeding scripts |
| `SKIP_AUTH` | `true` for local dev w/o login; `false` to enforce sign-in |
| `FETCH_CRON_SECRET` | Bearer token for `/api/fetch/run` (cron entry point) |
| `FETCH_BILLER_PARALLEL` | How many distinct billers to fetch concurrently (default 6) |
| `BILLER_FETCH_DELAY_MS` | Pause between two cards on the *same* biller (default 4000) |
| `STATIC_USER_*_EMAIL/PASSWORD` | Used by `npm run seed:users` |

### 3. Install & run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. With `SKIP_AUTH=true` you go straight to the dashboard. With `SKIP_AUTH=false` you're redirected to `/login` to sign up / sign in.

### 4. Create users

Two ways to add people who can use this:

**Option A — via the UI (open signup)**
- Go to `/login` → **Sign up** tab → email + password (≥ 8 chars). Repeat for each user.

**Option B — pre-seed two static accounts (no open signup)**

Fill in the seeding vars in `.env.local`:

```bash
STATIC_USER_1_EMAIL=you@example.com
STATIC_USER_1_PASSWORD=YourStrongPw123!
STATIC_USER_2_EMAIL=partner@example.com
STATIC_USER_2_PASSWORD=PartnerStrongPw456!
```

Then:

```bash
npm run seed:users
```

Each user gets their own private household. Re-running is idempotent (passwords get reset to what's in env).

### 5. (Optional) Adopt existing data

If you started in `SKIP_AUTH=true` mode and built up cards before flipping auth on, those cards live in a household with no `household_members` row ("orphan"). To move them to your real user account:

```bash
npm run migrate:cards -- you@example.com
```

The script finds orphan households, moves cards + profiles + (implicitly) bills into your user's household, resolves profile-name collisions, and deletes the now-empty source households. Idempotent — only touches data with no auth owner, so you can't accidentally yank data between real users.

### 6. Add cards & fetch bills

In the dashboard, **Add card** with:

| Field | Used for |
|---|---|
| Bank | Maps to BillDesk biller name (see `lib/banks.ts`) |
| Last 4 | Bill fetch authenticator |
| Registered mobile | Bill fetch authenticator (10-digit Indian number) |
| Nickname | Display only |
| Profile (optional) | Owner tag — e.g. Father, Wife, Mine — used for the Profile column filter |

Click **Fetch all bills** to pull every card's current statement. The progress bar shows real per-card status as it streams from the server.

### 7. Deploy to Vercel (optional)

1. Push the repo to GitHub (this README is already in `main`).
2. [vercel.com](https://vercel.com) → Import project.
3. Add all `.env.local` vars (except dev-only ones like `SUPABASE_INSECURE_TLS` and `DEV_HOUSEHOLD_ID`).
4. Set `NEXT_PUBLIC_APP_URL` to your production URL.

> Vercel functions time out before ~50 cards finish. Use the GitHub Actions cron (next section) for scheduled bulk fetches; the dashboard streaming endpoint is fine for on-demand smaller runs.

### 8. Scheduled fetch via GitHub Actions

In the GitHub repo → **Settings → Secrets and variables → Actions** → add:

| Secret | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |

The workflow `.github/workflows/fetch-bills.yml` runs twice daily (06:30 & 18:30 IST). It runs `npm run fetch:bills` directly, so it doesn't need the Vercel URL or `FETCH_CRON_SECRET` — it talks to Supabase from the runner.

Manual run: **Actions → Fetch credit card bills → Run workflow**.

## Architecture

```
┌───────────────┐    HTTPS    ┌──────────────────────────────┐
│  Browser UI   │ ─────────►  │  Next.js API routes          │
│  (Dashboard)  │             │   /api/cards   /api/bills    │
└───────────────┘             │   /api/profiles              │
       ▲                      │   /api/fetch/stream  (NDJSON)│
       │ NDJSON stream        │   /api/fetch/trigger (legacy)│
       │ (progress events)    └─────────────┬────────────────┘
       │                                    │
       │                                    ▼
       │                      ┌──────────────────────────────┐
       │                      │  lib/fetch-runner.ts         │
       │                      │  - Group by biller into lanes│
       │                      │  - Parallel across lanes     │
       │                      │  - Sequential within a lane  │
       │                      └─────────────┬────────────────┘
       │                                    │
       │                                    ▼
       │   ┌──────────────────┐  AES-GCM   ┌────────────────────┐
       └───┤  lib/billdesk/   │ ◄────────► │  hexagon.billdesk  │
           │   client.ts      │            │  /hgapp-instapay   │
           │   crypto.ts      │            │  /InstaPayController│
           │   parser.ts      │            └────────────────────┘
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │  Supabase        │  cards / bills / fetch_log / households / household_members
           │  (Postgres+Auth) │
           └──────────────────┘
```

## Project layout

```
app/                          Next.js App Router pages & API routes
  api/cards|bills|profiles    CRUD endpoints (RLS-scoped to household)
  api/fetch/stream            NDJSON progress streaming (UI button)
  api/fetch/run               Cron entry (Bearer FETCH_CRON_SECRET)
  api/fetch/trigger           Legacy non-streaming trigger
  login/                      Sign-in / sign-up tabs (email+password)
  reset-password/             Password recovery landing
components/                   Dashboard, CardForm, Spinner, UpiPayDialog
lib/billdesk/                 BillDesk client (init/billers/validate-payment + crypto)
lib/fetch-runner.ts           Batch fetch w/ per-biller lanes + onProgress
lib/banks.ts                  Biller map + per-bank rate-limit config (ICICI etc.)
lib/supabase/                 Browser, server (SSR), admin (service-role) clients
scripts/seed-users.ts         Bootstrap two static Supabase Auth accounts
scripts/migrate-to-user.ts    Move orphan households into one user's household
scripts/fetch-bills.ts        Local / CI batch fetch entry
supabase/schema.sql           Database schema + RLS policies
.github/workflows/            Cron job for scheduled fetches
```

## API routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/cards` | session | List the current user's cards |
| `POST /api/cards` | session | Create a card |
| `PATCH /api/cards/[id]` | session | Update a card |
| `DELETE /api/cards/[id]` | session | Soft-delete (sets `active = false`) |
| `GET /api/cards/[id]/upi` | session | Get the credit-card UPI VPA/QR |
| `POST /api/cards/[id]/fetch` | session | Fetch this one card's bill |
| `GET /api/bills` | session | List bills for the user's cards |
| `PATCH /api/bills/[id]` | session | Mark UNPAID / PARTIAL / PAID |
| `GET /api/profiles` | session | List card profiles (owner tags) |
| `POST /api/profiles` | session | Create a profile |
| `GET /api/fetch/latest` | session | Latest fetch_log row per card (UI status) |
| `POST /api/fetch/stream` | session | NDJSON live progress stream (dashboard button) |
| `POST /api/fetch/trigger` | session | Non-streaming trigger (legacy) |
| `POST /api/fetch/run` | Bearer `FETCH_CRON_SECRET` | Cron entry point — runs `runBatchFetch()` |

## Rate-limit notes (esp. ICICI)

`hexagon.billdesk.com` rate-limits per session/biller combo. The runner handles this automatically:

- **Lanes by biller**: cards are grouped by biller. Distinct billers run in parallel (default 6). Cards in the same biller run sequentially with a 4 s pause.
- **ICICI specifically** (`lib/banks.ts`): `laneDelayMs: 15000` + `freshSessionPerCard: true` — re-inits the BillDesk session before every ICICI card so each request has a brand-new `SESSIONKEY`.
- **Inside `fetchBill`**: on a "Too many request" response the client waits `6 → 12 → 24 → 30 s` (exponential, capped) and resets the session between retries.

Tune via `FETCH_BILLER_PARALLEL` and `BILLER_FETCH_DELAY_MS` if BillDesk gets crankier or you grow past ~30 cards on a single biller.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Redirect loop between `/` and `/login` | Stale cookies from previous `SKIP_AUTH` session | DevTools → Application → Cookies → clear for localhost, reload |
| `/login` says "Email not confirmed" | Supabase email-confirm is ON | Toggle it OFF in Supabase Auth settings, or click the confirmation link in your email |
| All fetches fail with `Missing NEXT_PUBLIC_SUPABASE_URL` | `.env.local` not loaded | `cp .env.example .env.local`, restart `npm run dev` |
| ICICI keeps returning "Too many request" | Lane defaults overridden, or VPN/proxy in play | Increase `BILLER_FETCH_DELAY_MS`; check `lib/banks.ts` ICICI entry; try without VPN |
| "Cannot read encrypted response" | `BILLDESK_RANDOM_KEY`/`BILLDESK_CERT_THUMB` rotated server-side | Re-run `npm run capture:crypto` and update env (rare — BillDesk has been stable on these values) |
| Cards table empty after enabling auth | Existing data lives in orphan household | `npm run migrate:cards -- your@email` |

## License

MIT-style: do what you want, no warranty. The BillDesk client is reverse-engineered for personal use; commercial use likely violates BillDesk's terms.
