# TradingTrainer

Practise trading Nasdaq-100 futures (MNQ and NQ) on replayed sessions. Pick a day, step through it bar by bar, trade it with real order types, and get coached on every trade. Lessons, a journal and progress stats are built in.

- **Replay:** any day or a random day with the date hidden; start at the Globex open, London, 08:30 or the 09:30 cash open; play, step or skip ahead. Bars after the cursor stay hidden.
- **Chart:** 1m to 1h, EMA, VWAP, Bollinger Bands, volume, RSI, MACD, trend lines, horizontal lines, rectangles, Fibonacci and long/short position planners.
- **Orders:** market, limit and stop with stop and target brackets you can drag on the chart; commission, slippage and gap fills.
- **Coach:** rule-based notes on every trade (stop size against ATR, trend, chasing, key levels, sweeps, fair value gaps, timing, exits) and an optional AI review written by Claude.
- **Learn:** six lessons with replay exercises and quizzes.
- **Stats:** equity, results in R, win rate, expectancy, drawdown, MAE/MFE, P/L by hour and weekday, recurring mistakes.
- **Accounts:** sign up with email; sessions, trades and lesson progress are saved privately per user.
- **Installable:** add it to a phone home screen or install it from Chrome/Edge like an app.

The site runs without any accounts or keys. In that **guest mode** the journal is kept in the browser and the AI coach is off. Each feature switches on when you add its keys.

---

## 1. Run it on your computer

1. Install **Node.js 20 or newer** from <https://nodejs.org> (the LTS version).
2. Open a terminal in this folder and run:
   ```sh
   npm install
   npm run dev
   ```
3. Open <http://localhost:3000>.

`npm run build` followed by `npm start` runs the production version.

## 2. Turn on accounts (Supabase, free tier is enough)

1. Create a project at <https://supabase.com>.
2. In the project, open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql` and click **Run**. This creates the tables and locks each one so users only ever see their own rows.
3. Open **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000` for now (change it to your real address once the site is online).
   - **Redirect URLs:** add `http://localhost:3000/auth/callback` and, later, `https://YOUR-DOMAIN/auth/callback`.
4. Open **Project Settings → API Keys** and copy the **Project URL** and the **publishable key**.
5. Copy `.env.example` to `.env.local` and fill in:
   ```sh
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
6. Stop and restart `npm run dev`. A **Sign in** button appears in the top bar.

Sign-up sends a confirmation email. Supabase's built-in email sender is meant for testing and is heavily rate-limited, so set up your own SMTP provider under **Authentication → Emails** before you invite other people. If you would rather skip confirmation while testing, turn off **Confirm email** under **Authentication → Sign In / Providers → Email**.

Sessions traded as a guest stay in that browser. After signing in, the Stats page offers to move them into the account.

## 3. Turn on the AI coach (Claude API)

1. Create an API key at <https://console.anthropic.com>.
2. Add it to `.env.local`:
   ```sh
   ANTHROPIC_API_KEY=sk-ant-...
   COACH_MODEL=claude-haiku-5-5   # fast and cheap; claude-sonnet-5-5 writes deeper reviews
   COACH_DAILY_LIMIT=40           # reviews per signed-in user per 24 hours
   ```
3. Restart. Closed trades get an **Ask the AI coach** button in the Coach card and in the Trades tab.

The key stays on the server (`src/app/api/coach/route.ts`). When accounts are on, only signed-in users can request reviews, up to the daily limit. Without accounts, anyone who opens the site can use the coach (limited per IP address), so turn on accounts before you put the key on a public site. Each review is one short request; check Anthropic's pricing page for current costs.

## 4. Put it online (Vercel)

1. Put this folder in a GitHub repository (GitHub Desktop is the easiest way if you are new to git).
2. Go to <https://vercel.com>, sign in with GitHub, click **Add New → Project** and import the repository. Vercel detects Next.js; keep the defaults.
3. Under **Environment Variables**, add the same variables as in `.env.local`, then click **Deploy**.
4. In Supabase, set the **Site URL** to your Vercel address and add `https://YOUR-SITE.vercel.app/auth/callback` to the **Redirect URLs**.
5. Optional: add your own domain under **Vercel → Project → Settings → Domains**, then update the Supabase URLs again.

Every push to the main branch redeploys automatically. Variables that start with `NEXT_PUBLIC_` are baked in at build time, so redeploy after changing them.

## 5. Install it like an app

- **iPhone/iPad:** open the site in Safari → Share → **Add to Home Screen**.
- **Android:** open it in Chrome → menu → **Install app**.
- **Desktop:** Chrome or Edge show an install icon in the address bar.

It opens full screen on the replay, with its own icon.

## 6. Real market data

The built-in sessions are **generated**: they behave like NQ (quiet Asia, London pick-up, 08:30 spikes, fast open, lunch lull) but are not history. To replay real days:

1. Get 1-minute bars. `scripts/fetch_nq_databento.py` downloads NQ or MNQ from Databento (new accounts get free credits) and writes the right CSV:
   ```sh
   pip install databento
   export DATABENTO_API_KEY=db-...        # Windows PowerShell: $env:DATABENTO_API_KEY="db-..."
   python scripts/fetch_nq_databento.py --start 2025-01-01 --end 2025-04-01
   ```
   It prints the cost and asks before downloading. Add `--symbol MNQ` for the micro contract.
   TradingView and NinjaTrader exports work too.
2. In the replay, open **Data → Choose CSV file**, or drop the file onto the chart. The data stays in that browser.

**Licensing:** data bought on a personal plan is for your own use. Offering real historical data to other users of a public site needs a vendor plan that allows redistribution. Until then, users bring their own files.

## Project layout

```
src/app/            pages: / (home), /replay, /learn, /stats, /login, /account, auth routes, /api/coach
src/components/     React components (nav, trainer host, stats, lessons, auth forms)
src/lib/engine.js   market data, indicators, order simulator, statistics, coaching rules (no DOM)
src/lib/trainer.js  the replay screen: chart, orders on the chart, drawings, panels
src/lib/journal.ts  where sessions are saved: browser (guest) or Supabase (signed in)
src/lib/lessons.ts  lesson text and quizzes
src/lib/coachPrompt.ts  the AI coach prompt and input checks
supabase/migrations/    database tables and row-level security
scripts/            Databento download script
tests/              engine tests (npm test) and a browser test (tests/e2e.mjs)
```

## Tests

```sh
npm test                                  # engine: fills, P/L, indicators, CSV, coaching rules
npm run typecheck
npm run build && npm start                # then, in a second terminal:
npm i -D playwright && npx playwright install chromium
node tests/e2e.mjs http://localhost:3000  # clicks through the whole site in a real browser
```

## Next steps

- Real data for every user: a licensed data source behind an API, instead of files per browser.
- More markets: OMXS30 and US stocks (the engine is market-agnostic; contract specs live in `INSTRUMENTS`).
- Options module with modelled prices first (Black-Scholes from the underlying and an implied-volatility proxy).
- Teacher features: share a scenario (day, start time, task) with a class and compare results.

TradingTrainer is an educational simulator. Nothing in it is investment advice, and results in practice do not predict real results.
