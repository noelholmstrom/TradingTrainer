import Link from 'next/link';

const TICKS = [{ t: '18:00', m: 0 }, { t: '03:00', m: 540 }, { t: '09:30', m: 930 }, { t: '16:00', m: 1320 }];
const SEGMENTS = [
  { name: 'Asia', m: 540 }, { name: 'London', m: 330 }, { name: '', m: 60 },
  { name: 'NY AM', m: 150, rth: true }, { name: 'Lunch', m: 90, rth: true }, { name: 'NY PM', m: 150, rth: true }, { name: '', m: 60 }
];

export default function Home() {
  return (
    <>
      <main className="page">
        <section className="hero">
          <div>
            <span className="eyebrow">Nasdaq-100 futures · MNQ and NQ</span>
            <h1>Replay any Nasdaq session. <em>Trade it bar by bar.</em></h1>
            <p className="lede">
              Step through a full Globex day, trade it with real order types, and get coached on every trade.
              Your journal and stats show what to fix next.
            </p>
            <div className="cta-row">
              <Link className="btn primary big" href="/replay">Start a replay</Link>
              <Link className="btn big" href="/learn">Learn the basics</Link>
            </div>
            <div className="contract-strip" aria-label="Contract details">
              <div><span>MNQ</span><b>$2 / point</b></div>
              <div><span>NQ</span><b>$20 / point</b></div>
              <div><span>Tick</span><b>0.25 pts</b></div>
              <div><span>Globex, ET</span><b>18:00–17:00</b></div>
            </div>
          </div>
          <div className="hero-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/preview-dark.png" width={1440} height={848}
              alt="The replay screen: a 1-minute Nasdaq-100 futures chart with moving averages, VWAP, RSI and MACD, an open position with its stop and target, and the order ticket."
            />
          </div>
        </section>

        <h2>What you can do</h2>
        <div className="features">
          <article className="feature wide">
            <h3>Replay any session</h3>
            <p>Pick a date, or a random day with the date hidden so you can&apos;t trade from memory. Start at the Globex open, London, the 08:30 data or the cash open, then play, step or skip ahead. Bars after the cursor stay hidden until the session ends.</p>
            <div className="session-band" aria-hidden="true">
              <div className="bar">
                {SEGMENTS.map((s, i) => <div key={i} className={[s.rth ? 'rth' : '', s.m < 160 ? 'narrow' : ''].join(' ').trim() || undefined} style={{ width: `${(s.m / 1380) * 100}%` }}>{s.name}</div>)}
              </div>
              <div className="ticks">{TICKS.map(k => <span key={k.t} style={{ left: `${(k.m / 1380) * 100}%` }}>{k.t}</span>)}</div>
            </div>
          </article>
          <article className="feature">
            <h3>Trade it like the real thing</h3>
            <p>Market, limit and stop orders with stops and targets you drag on the chart. Commission, slippage and gap fills are included, and EMA, VWAP, RSI, MACD, Fibonacci and position tools are on the chart.</p>
          </article>
          <article className="feature">
            <h3>A coach on every trade</h3>
            <p>Notes on stop size against volatility, trend, chasing, key levels, sweeps and fair value gaps, plus what price did after you exited. Ask the AI coach for a written review of any trade.</p>
          </article>
          <article className="feature">
            <h3>Progress you can measure</h3>
            <p>Win rate, expectancy in R, drawdown, MAE and MFE, your best and worst hours, and the mistakes that keep coming back, across every session you trade.</p>
          </article>
          <article className="feature">
            <h3>Lessons that end in practice</h3>
            <p>Six short lessons on the contract, risk, sessions and levels, trend tools, fair value gaps and reviewing trades. Each one ends with an exercise in the replay.</p>
          </article>
        </div>

        <h2>How a session works</h2>
        <ol className="steps">
          <li><b>Pick a day and a start time</b>Choose a date or a hidden random day, and where to start: the overnight session, London or the 09:30 open.</li>
          <li><b>Trade it as it unfolds</b>Play at your speed, place orders from the ticket or the keyboard, and manage the position on the chart.</li>
          <li><b>Review and repeat</b>Each closed trade gets coaching notes. The session review and your stats show the one thing to work on next.</li>
        </ol>
      </main>
      <footer className="site-foot">
        <span>TradingTrainer is an educational simulator. Nothing here is investment advice, and practice results do not predict real results.</span>
        <span>Sample sessions are generated, not historical. Import your own data to replay real days.</span>
      </footer>
    </>
  );
}
