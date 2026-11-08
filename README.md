# TradingTrainer

Practise trading Nasdaq-100 futures (MNQ and NQ) on replayed sessions. Pick a day, step through it bar by bar, trade it with real order types, and get coached on every trade. Lessons, a journal and progress stats are built in.

- **Real data:** actual CME Nasdaq-100 futures for any day since June 2010, through Databento (each trader's own key, or the site owner's).
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

1. Create a project at <https://supabase.com> (keep the default security options).
2. In the project, open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql` and click **Run**. This creates the tables, gives signed-in users access to them and locks each one so users only ever see their own rows.
3. Open **Authentication → URL Configuration**:
   - **Site URL:** your site's address, e.g. `https://your-site.vercel.app` (or `http://localhost:3000` if you only run it locally).
   - **Redirect URLs:** add `https://your-site.vercel.app/**` and `http://localhost:3000/**`.
4. Click **Connect** at the top of the project page and pick **Next.js**. It shows the two values you need:
   ```sh
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
5. Put them in Vercel (**Settings → Environment Variables**, then redeploy) or, to run locally, in a `.env.local` file copied from `.env.example`, then restart `npm run dev`. A **Sign in** button appears in the top bar.

**Emails:** Supabase's built-in email sender only delivers to the email addresses of your Supabase team (that is, you) and only a couple of messages per hour. So that other people can sign up, turn off **Confirm email** in the Email provider settings (**Authentication → Sign In / Providers**). Sign-in links and password-reset emails still only reach your own address until you add your own SMTP provider under **Authentication → Emails**, which needs a domain of your own.

**Free plan:** Supabase pauses free projects after 7 days of low activity (it emails a warning first). If sign-in stops working after a quiet spell, open the project in Supabase and click **Resume project**.

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

The built-in sample sessions are **generated**: they behave like NQ (quiet Asia, London pick-up, 08:30 spikes, fast open, lunch lull) but are not history. The replay can also load **real CME Nasdaq-100 futures** (front-month NQ, 1-minute bars) for any day since June 2010, straight from [Databento](https://databento.com). Opening a day fetches that session plus the four before it (for the indicators and prior-day levels); days you have opened are kept in the browser, so opening them again costs nothing.

There are two ways to pay for and license that data:

- **Each trader uses their own key.** In the replay, open **Data**, paste a Databento API key and click **Save**. New Databento accounts get $125 of free credit, and each day uses a small amount of it. The key is kept in that browser and sent with each request for bars; the site doesn't store or log it.
- **The site owner's key, for the owner only.** Add these in Vercel (**Settings → Environment Variables**), then redeploy:
  ```sh
  DATABENTO_API_KEY=db-...
  DATA_OWNER_EMAILS=you@example.com   # accounts allowed to use the site's key, comma-separated
  ```
  Signed-in accounts on that list get real data on every device without pasting a key. This needs accounts (section 2).

**Licensing:** real CME data is licensed to whoever pays for it. A personal Databento account covers your own use, which is why the site's key is limited to `DATA_OWNER_EMAILS` and everyone else brings their own key. Showing real data from your account to other users needs a distribution licence (for example Databento's plans that include external distribution).

You can still import files: open **Data → Choose CSV file** in the replay, or drop a file onto the chart (the data stays in that browser). `scripts/fetch_nq_databento.py` downloads NQ or MNQ bars from Databento into the right format:
```sh
pip install databento
export DATABENTO_API_KEY=db-...        # Windows PowerShell: $env:DATABENTO_API_KEY="db-..."
python scripts/fetch_nq_databento.py --start 2025-01-01 --end 2025-04-01
```
It prints the cost and asks before downloading. TradingView and NinjaTrader exports work too.

## Project layout

```
src/app/            pages: / (home), /replay, /learn, /stats, /login, /account, auth routes, /api/coach, /api/bars
src/components/     React components (nav, trainer host, stats, lessons, auth forms)
src/lib/engine.js   market data, indicators, order simulator, statistics, coaching rules (no DOM)
src/lib/trainer.js  the replay screen: chart, orders on the chart, drawings, panels
src/lib/journal.ts  where sessions are saved: browser (guest) or Supabase (signed in)
src/lib/lessons.ts  lesson text and quizzes
src/lib/coachPrompt.ts  the AI coach prompt and input checks
src/lib/databento.js    Databento request and response handling for real bars
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

To test real data without a Databento key, run the stand-in API and point the app at it:
```sh
node tests/mock-databento.mjs 4010
DATABENTO_BASE_URL=http://localhost:4010 npm start
node tests/e2e-real.mjs http://localhost:3000 http://localhost:4010
```

## Next steps

- Real data for every user without their own key: needs a data licence that allows distribution.
- More markets: OMXS30 and US stocks (the engine is market-agnostic; contract specs live in `INSTRUMENTS`).
- Options module with modelled prices first (Black-Scholes from the underlying and an implied-volatility proxy).
- Teacher features: share a scenario (day, start time, task) with a class and compare results.

TradingTrainer is an educational simulator. Nothing in it is investment advice, and results in practice do not predict real results.
