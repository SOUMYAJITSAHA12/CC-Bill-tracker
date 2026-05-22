# CC Bill Tracker

Credit card bill tracker for **~100 cards** and **4–5 users** — **free** stack, **BillDesk API** (reverse-engineered), no Telegram.

- **UI:** Next.js on [Vercel](https://vercel.com) (free)
- **DB + Auth:** [Supabase](https://supabase.com) (free)
- **Fetch:** Pure HTTP to BillDesk InstaPay (`InstaPayController`) — run via **GitHub Actions** or `npm run fetch:bills`

Based on [SOUMYAJITSAHA12/CC-Bill-tracker](https://github.com/SOUMYAJITSAHA12/CC-Bill-tracker) (Selenium) — this version replaces the browser with an API client.

## Quick start

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → paste and run `supabase/schema.sql`
3. Authentication → enable Email (magic link)
4. Copy **Project URL**, **anon key**, **service role key**

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in Supabase keys and generate `FETCH_CRON_SECRET`:

```bash
openssl rand -hex 32
```

### 3. Install & run UI

```bash
npm install
npm run dev
```

Open http://localhost:3000 → sign in → add cards (bank, last4, registered mobile).

### 4. BillDesk crypto (required for fetch)

Fetch will fail until you implement encryption in `lib/billdesk/crypto.ts`.

1. Read `billdesk/RE-NOTES.md`
2. Use Chrome DevTools on the Kotak BillDesk portal to capture `OPERATIONID` + plaintext payloads
3. Extract algorithm from `main.*.js`
4. Implement `encryptReqData` / `decryptResData`

Test locally:

```bash
npm run fetch:bills
```

### 5. Deploy to Vercel

1. Push repo to GitHub
2. [vercel.com](https://vercel.com) → Import project
3. Add env vars from `.env.example`
4. `NEXT_PUBLIC_APP_URL` = your production URL

**Note:** Vercel cannot fetch 100 cards in one request (timeout). Use GitHub Actions (below).

### 6. Scheduled fetch (free)

GitHub → Settings → Secrets:

| Secret | Value |
|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |

Workflow `.github/workflows/fetch-bills.yml` runs twice daily.

Manual run: Actions → **Fetch credit card bills** → Run workflow.

## Multi-user (4–5 people)

- Each person signs in with email (magic link)
- First login creates a **household**
- To share one household: add rows to `household_members` in Supabase for other `user_id`s (SQL), or build an invite flow later

## Card fields

| Field | Used for |
|-------|----------|
| Bank | Maps to BillDesk biller name |
| Last 4 | Bill fetch |
| Registered mobile | Bill fetch |
| Nickname | Display only |

## Project layout

```
app/              Next.js pages & API routes
components/       Dashboard UI
lib/billdesk/     Reverse-engineered BillDesk client
lib/fetch-runner.ts   Batch fetch → Supabase
scripts/          Local fetch + RE helpers
supabase/         SQL schema
```

## API routes

| Route | Purpose |
|-------|---------|
| `POST /api/fetch/run` | Cron/worker (Bearer `FETCH_CRON_SECRET`) |
| `POST /api/fetch/trigger` | UI button (authenticated) |

## License / disclaimer

Automating consumer bill portals may violate terms of use. For personal/household use only. You are responsible for compliance.
