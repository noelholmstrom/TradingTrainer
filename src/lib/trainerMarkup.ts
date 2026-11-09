/* Static markup for the trainer. mountTrainer() wires it up. */
export const TRAINER_MARKUP = String.raw`<div class="trainer" id="trainer">
  <header class="topbar">
    <div class="seg-group" role="group" aria-label="Contract" id="instGroup">
      <button type="button" data-inst="MNQ" aria-pressed="true" title="Micro E-mini Nasdaq-100 · $2 per point">MNQ</button>
      <button type="button" data-inst="NQ" aria-pressed="false" title="E-mini Nasdaq-100 · $20 per point">NQ</button>
    </div>
    <div class="seg-group" role="group" aria-label="Timeframe" id="tfGroup">
      <button type="button" data-tf="1">1m</button>
      <button type="button" data-tf="2">2m</button>
      <button type="button" data-tf="3">3m</button>
      <button type="button" data-tf="5">5m</button>
      <button type="button" data-tf="15">15m</button>
      <button type="button" data-tf="30">30m</button>
      <button type="button" data-tf="60">1h</button>
    </div>
    <button type="button" class="btn" id="btnIndicators" aria-haspopup="dialog" aria-expanded="false">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1.5 12.5l4-5 3 3 6-8"/><path d="M1.5 14.5h13"/></svg>Indicators
    </button>
    <button type="button" class="btn" id="btnData" aria-haspopup="dialog" aria-expanded="false">
      <span class="data-chip"><i class="dot" id="dataDot"></i><span id="dataLabel">Sample data</span></span>
    </button>
    <span class="spacer"></span>
    <button type="button" class="btn icon" id="btnSide" aria-pressed="false" aria-label="Hide the side panel">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M10.5 2.5v11"/></svg>
    </button>
    <button type="button" class="btn icon" id="btnFull" aria-pressed="false" aria-label="Fullscreen">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" class="ic-enter"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" class="ic-exit"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>
    </button>
    <button type="button" class="btn icon" id="btnSettings" aria-label="Simulation settings" aria-haspopup="dialog" aria-expanded="false">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>
    </button>
    <button type="button" class="btn icon" id="btnHelp" aria-label="Keyboard shortcuts" aria-haspopup="dialog" aria-expanded="false">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="4" width="13" height="8.5" rx="1.5"/><path d="M4 7h1M7 7h2M11 7h1M4.5 10h7"/></svg>
    </button>
  </header>

  <main class="workspace">
    <nav class="tools" aria-label="Drawing tools" id="tools">
      <button type="button" data-tool="cursor" aria-pressed="true" title="Cursor (Esc)" aria-label="Cursor">
        <svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><path d="M4 2.5l9.5 7.2-4.2.5 2.4 4.7-1.8.9-2.4-4.7L4 14z"/></svg>
      </button>
      <button type="button" data-tool="trend" aria-pressed="false" title="Trend line (Alt+T)" aria-label="Trend line">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 14.5L15 3.5"/><circle cx="3" cy="14.5" r="1.6" fill="currentColor"/><circle cx="15" cy="3.5" r="1.6" fill="currentColor"/></svg>
      </button>
      <button type="button" data-tool="hline" aria-pressed="false" title="Horizontal line (Alt+H)" aria-label="Horizontal line">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1.5 9h15"/><circle cx="9" cy="9" r="1.6" fill="currentColor"/></svg>
      </button>
      <button type="button" data-tool="rect" aria-pressed="false" title="Rectangle (Alt+R)" aria-label="Rectangle">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4.5" width="12" height="9" rx="1"/></svg>
      </button>
      <button type="button" data-tool="fib" aria-pressed="false" title="Fibonacci retracement (Alt+F)" aria-label="Fibonacci retracement">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M2 3.5h14M2 7h14M2 9.8h14M2 12.4h14M2 15.5h14" opacity=".9"/><path d="M3 15.5L15 3.5" stroke-dasharray="2 2"/></svg>
      </button>
      <hr>
      <button type="button" data-tool="long" aria-pressed="false" title="Long position planner (Alt+L)" aria-label="Long position planner">
        <svg viewBox="0 0 18 18" aria-hidden="true"><rect x="3" y="3" width="12" height="6" fill="var(--up)" opacity=".55"/><rect x="3" y="9" width="12" height="4.5" fill="var(--down)" opacity=".55"/><path d="M3 9h12" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
      <button type="button" data-tool="short" aria-pressed="false" title="Short position planner (Alt+S)" aria-label="Short position planner">
        <svg viewBox="0 0 18 18" aria-hidden="true"><rect x="3" y="4.5" width="12" height="4.5" fill="var(--down)" opacity=".55"/><rect x="3" y="9" width="12" height="6" fill="var(--up)" opacity=".55"/><path d="M3 9h12" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
      <hr>
      <button type="button" id="btnMagnet" aria-pressed="true" title="Snap to candle highs, lows, opens and closes" aria-label="Magnet">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 3.5v6a5 5 0 0010 0v-6"/><path d="M4 6.5h3M11 6.5h3"/><path d="M7 3.5v6a2 2 0 004 0v-6"/></svg>
      </button>
      <button type="button" id="btnClearDraw" title="Remove all drawings" aria-label="Remove all drawings">
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3.5 5h11M7 5V3.5h4V5M5 5l.8 10h6.4L13 5"/></svg>
      </button>
    </nav>

    <section class="chart-col" aria-label="Chart and replay controls">
      <div class="chart-wrap" id="chartWrap">
        <div id="chart"></div>
        <div class="legend" id="legend" aria-live="off"></div>
        <div class="draw-actions" id="drawActions" hidden></div>
        <div class="drop-hint" id="dropHint" hidden>Drop the CSV to import it</div>
        <div class="chart-empty" id="chartEmpty">Loading the chart…</div>
        <div class="ict-panel" id="ictPanel" hidden></div>
        <div class="quick-trade" id="quickTrade" role="group" aria-label="Quick trade" hidden>
          <button type="button" class="qt-sell" data-qt="sell" title="Sell at market (S)"><span>Sell</span><small id="qtSellSub">market</small></button>
          <span class="qt-qty"><button type="button" data-qt="minus" aria-label="Fewer contracts">−</button><b id="qtQty">1</b><button type="button" data-qt="plus" aria-label="More contracts">+</button></span>
          <button type="button" class="qt-buy" data-qt="buy" title="Buy at market (B)"><span>Buy</span><small id="qtBuySub">market</small></button>
          <button type="button" class="qt-flat" data-qt="flat" title="Flatten (F)">Flat</button>
          <span class="qt-pos" id="qtPos">Flat</span>
        </div>
      </div>

      <div class="deck" id="deck">
        <div class="deck-row">
          <label class="lbl" for="dayInput">Session</label>
          <input class="field" type="date" id="dayInput">
          <span class="hidden-day" id="hiddenDay" hidden>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><path d="M2.5 13.5l11-11"/></svg>
            Hidden day
          </span>
          <button type="button" class="btn" id="btnRandom" title="Load a random session">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5"/><circle cx="5.5" cy="5.5" r=".9" fill="currentColor"/><circle cx="10.5" cy="10.5" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/></svg>
            Random day
          </button>
          <label class="chk" title="Random days hide their date until the session ends, so you can't trade from memory">
            <input type="checkbox" id="chkBlind"> Hide date
          </label>
          <span class="spacer"></span>
          <label class="lbl" for="startSel">Start at</label>
          <select class="field" id="startSel">
            <option value="1080">18:00 · Globex open</option>
            <option value="180">03:00 · London open</option>
            <option value="480">08:00</option>
            <option value="510">08:30 · US data</option>
            <option value="540">09:00</option>
            <option value="570">09:30 · Cash open</option>
            <option value="600">10:00</option>
            <option value="720">12:00</option>
            <option value="840">14:00</option>
            <option value="930">15:30</option>
          </select>
          <button type="button" class="btn" id="btnRestart" title="Reload this session from the start time">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 109.6-3.7"/><path d="M12.5 1.5v3h-3"/></svg>
            Restart
          </button>
        </div>
        <div class="deck-row">
          <button type="button" class="btn primary play-btn" id="btnPlay" aria-label="Play">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" id="playIcon"><path d="M4 2.5l9 5.5-9 5.5z"/></svg>
            <span id="playText">Play</span>
          </button>
          <button type="button" class="btn" id="btnStep" title="Next bar (→)">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 2.5l7 5.5-7 5.5z"/><rect x="11" y="2.5" width="2" height="11" rx=".5"/></svg>
            Step
          </button>
          <select class="field" id="speedSel" aria-label="Replay speed">
            <option value="1">1 bar/s</option>
            <option value="2">2 bars/s</option>
            <option value="5">5 bars/s</option>
            <option value="10">10 bars/s</option>
            <option value="30">30 bars/s</option>
            <option value="60">60 bars/s</option>
          </select>
          <div class="clock" aria-live="off"><span class="t" id="clockTime">--:--</span><span class="d" id="clockDate">New York time</span></div>
          <div class="strip" id="strip" role="slider" tabindex="0" aria-label="Session timeline. Click ahead of the marker to skip forward." aria-valuemin="0" aria-valuemax="1380" aria-valuenow="0">
            <div class="strip-track" id="stripTrack"></div>
            <div class="strip-fill" id="stripFill"></div>
            <div id="stripMarks"></div>
            <div class="strip-cursor" id="stripCursor"></div>
            <div class="strip-labels" id="stripLabels"></div>
            <div class="strip-hover" id="stripHover" hidden></div>
          </div>
          <button type="button" class="btn" id="btnEnd" title="Close any position, finish the session and see your review">End session</button>
        </div>
      </div>
    </section>

    <aside class="side" aria-label="Order ticket and account">
      <section class="card lesson-card" id="lessonCard" hidden></section>
      <section class="card" id="ticketCard">
        <h2>Order ticket <span class="aside" id="instSpec">MNQ · $2/pt</span></h2>
        <div class="ticket-last"><span class="muted">Last</span><span class="px" id="lastPx">—</span></div>
        <div class="seg-group" role="group" aria-label="Order type" id="typeGroup" style="width:100%">
          <button type="button" data-type="market" aria-pressed="true" style="flex:1">Market</button>
          <button type="button" data-type="limit" aria-pressed="false" style="flex:1">Limit</button>
          <button type="button" data-type="stop" aria-pressed="false" style="flex:1">Stop</button>
        </div>
        <div class="row2">
          <label class="ctl"><span>Contracts</span>
            <span class="stepper"><button type="button" data-step="qty:-1" aria-label="Fewer contracts">−</button><input id="qtyIn" inputmode="numeric" value="1" aria-label="Contracts"><button type="button" data-step="qty:1" aria-label="More contracts">+</button></span>
          </label>
          <label class="ctl" id="priceCtl" hidden><span>Price</span>
            <span class="stepper"><button type="button" data-step="price:-1" aria-label="Lower price">−</button><input id="priceIn" inputmode="decimal" aria-label="Order price"><button type="button" data-step="price:1" aria-label="Higher price">+</button></span>
          </label>
        </div>
        <button type="button" class="btn ghost" id="btnPickPrice" hidden title="Click the chart to set the order price">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 0.5v4M8 11.5v4M0.5 8h4M11.5 8h4"/></svg>
          Pick price on chart
        </button>
        <div class="bracket">
          <label class="chk"><input type="checkbox" id="slOn"> Stop</label>
          <span class="stepper"><button type="button" data-step="sl:-1" aria-label="Tighter stop">−</button><input id="slIn" inputmode="decimal" aria-label="Stop distance in points"><button type="button" data-step="sl:1" aria-label="Wider stop">+</button></span>
          <label class="chk"><input type="checkbox" id="tpOn"> Target</label>
          <span class="stepper"><button type="button" data-step="tp:-1" aria-label="Closer target">−</button><input id="tpIn" inputmode="decimal" aria-label="Target distance in points"><button type="button" data-step="tp:1" aria-label="Further target">+</button></span>
        </div>
        <div class="risk-line" id="riskLine"></div>
        <div class="trade-btns">
          <button type="button" class="buy" id="btnBuy" title="Buy (B buys at market)"><span id="buyLbl">Buy</span><small id="buySub">market</small></button>
          <button type="button" class="sell" id="btnSell" title="Sell (S sells at market)"><span id="sellLbl">Sell</span><small id="sellSub">market</small></button>
        </div>
        <p class="hint">Stop and target are points from your fill. Drag any order line on the chart to move it.</p>
      </section>

      <section class="card" id="accountCard">
        <h2>Account <span class="aside" id="acctSub">Simulated</span></h2>
        <div class="acct" id="acctGrid"></div>
        <div class="pos-box" id="posBox"></div>
      </section>

      <section class="card" id="coachCard">
        <h2>Coach <span class="aside" id="coachSub">Rule-based preview</span></h2>
        <div id="coachBody"></div>
      </section>
    </aside>
  </main>

  <section class="bottom" aria-label="Orders, trades and statistics">
    <div class="splitter" id="splitBottom" role="separator" aria-orientation="horizontal" aria-label="Resize the bottom panel. Arrow keys resize, Enter folds it." tabindex="0"></div>
    <div class="tabs" role="tablist" id="tabs">
      <button type="button" role="tab" data-tab="orders" aria-selected="true" id="tab-orders" aria-controls="panel-orders">Orders <span class="count" id="cntOrders">0</span></button>
      <button type="button" role="tab" data-tab="trades" aria-selected="false" id="tab-trades" aria-controls="panel-trades">Trades <span class="count" id="cntTrades">0</span></button>
      <button type="button" role="tab" data-tab="stats" aria-selected="false" id="tab-stats" aria-controls="panel-stats">Session stats</button>
      <button type="button" role="tab" data-tab="journal" aria-selected="false" id="tab-journal" aria-controls="panel-journal">Journal <span class="count" id="cntJournal"></span></button>
      <button type="button" class="tabs-toggle" id="btnBottom" aria-expanded="true" aria-label="Hide the bottom panel">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>
      </button>
    </div>
    <div class="panel" role="tabpanel" id="panel-orders" aria-labelledby="tab-orders"></div>
    <div class="panel" role="tabpanel" id="panel-trades" aria-labelledby="tab-trades" hidden></div>
    <div class="panel" role="tabpanel" id="panel-stats" aria-labelledby="tab-stats" hidden></div>
    <div class="panel" role="tabpanel" id="panel-journal" aria-labelledby="tab-journal" hidden></div>
  </section>
</div>

<div class="popover" id="popIndicators" role="dialog" aria-label="Indicators" hidden></div>
<div class="popover" id="popData" role="dialog" aria-label="Market data" hidden></div>
<div class="popover" id="popSettings" role="dialog" aria-label="Simulation settings" hidden></div>
<div class="popover" id="popHelp" role="dialog" aria-label="Keyboard shortcuts" hidden>
  <h3>Keyboard</h3>
  <div class="kbd-list">
    <kbd>Space</kbd><span>Play / pause</span>
    <kbd>→</kbd><span>Next bar</span>
    <kbd>B</kbd><span>Buy at market (uses the ticket's size, stop and target)</span>
    <kbd>S</kbd><span>Sell at market</span>
    <kbd>F</kbd><span>Flatten the position</span>
    <kbd>Shift + F</kbd><span>Fullscreen on and off</span>
    <kbd>Alt + T / H / R / F</kbd><span>Trend line, horizontal line, rectangle, Fibonacci</span>
    <kbd>Alt + L / S</kbd><span>Long or short position planner</span>
    <kbd>Delete</kbd><span>Remove the selected drawing</span>
    <kbd>Esc</kbd><span>Back to the cursor, close menus</span>
  </div>
  <p>Market orders fill at the last price plus slippage. Limit orders fill at their price when it trades. Stops fill at their price plus slippage, or at the open if price jumps past them. When a stop and a target both sit inside one bar, the stop is assumed to fill first.</p>
</div>
<div id="modalRoot"></div>
<div class="toasts" id="toasts" aria-live="polite"></div>
`;
