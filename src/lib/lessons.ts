/* Module 1: foundations of trading Nasdaq-100 futures. Each lesson ends in a replay exercise and a short quiz. */

export type Block =
  | { h: string }
  | { p: string }
  | { ul: string[] }
  | { ex: { title: string; lines: string[] } };
export type QuizQ = { q: string; options: string[]; answer: number; why: string };
export type Lesson = {
  slug: string;
  title: string;
  minutes: number;
  summary: string;
  blocks: Block[];
  terms?: [string, string][];
  practice: { task: string; start: number; random: boolean; blind?: boolean; tf?: number };
  quiz: QuizQ[];
};

export const LESSONS: Lesson[] = [
  {
    slug: 'the-contract',
    title: 'The Nasdaq-100 futures contract',
    minutes: 7,
    summary: 'What NQ and MNQ are, what a tick is worth, when they trade and what moves them.',
    blocks: [
      { p: 'Nasdaq-100 futures let you trade the whole Nasdaq-100 index, the 100 largest non-financial companies listed on Nasdaq, with a single contract. They trade on CME Globex almost around the clock, so you can trade the reaction to US economic data at 08:30 New York time, an hour before the stock market opens.' },
      { h: 'Two sizes, one price' },
      { ul: [
        'NQ, the E-mini: $20 per index point. The minimum move, one tick, is 0.25 points and is worth $5.',
        'MNQ, the Micro E-mini: $2 per point, so one tick is worth $0.50. It is one tenth of NQ and the sensible size while you learn.',
        'Both follow the same index and show the same price. A 40-point move is $800 on one NQ and $80 on one MNQ.'
      ] },
      { h: 'When it trades' },
      { ul: [
        'Globex runs from Sunday to Friday, 18:00 to 17:00 New York time, with a one-hour break every afternoon.',
        'The busiest hours are the US cash session, 09:30 to 16:00, when the underlying stocks trade.',
        'Overnight has two phases worth knowing: Asia (18:00 to 03:00) is usually quiet, and London (03:00 to 08:30) often sets the first real range of the day.'
      ] },
      { h: 'What moves it' },
      { p: 'NQ is heavy in large technology companies, so their earnings and anything that changes interest-rate expectations matter most. Scheduled US data such as inflation (CPI) and the jobs report comes out at 08:30, more data at 10:00, and Federal Reserve rate decisions at 14:00 on meeting days. Bars widen in the minutes after those releases, and stops slip further.' },
      { h: 'Contract months' },
      { p: 'Each contract expires on the third Friday of March, June, September or December. Traders move to the next contract about a week before expiry, so most volume sits in the front month. The replay uses a continuous front-month series, which is why prices can jump on a roll day.' },
      { ex: { title: 'Worked example', lines: [
        'You buy 2 MNQ at 21,350.00 and sell at 21,372.50.',
        'Gain: 22.50 points × $2 × 2 contracts = $90.00 before commission.',
        'The same trade with 2 NQ: 22.50 × $20 × 2 = $900.00.'
      ] } }
    ],
    terms: [
      ['Tick', 'The minimum price move, 0.25 index points'],
      ['Point value', 'Dollars per one-point move: $20 for NQ, $2 for MNQ'],
      ['RTH', 'Regular trading hours, the 09:30–16:00 cash session'],
      ['Globex / ETH', 'Electronic trading outside the cash session, 18:00–09:30']
    ],
    practice: { task: 'Start at 09:30 and take one trade with a 20-point stop. Before you click, work out what the stop costs on MNQ, then check the risk line in the ticket.', start: 570, random: true, blind: true },
    quiz: [
      { q: 'One MNQ contract moves 15 points in your favour. What do you make before costs?', options: ['$15', '$30', '$300', '$7.50'], answer: 1, why: 'MNQ is worth $2 per point, so 15 points is $30. On NQ the same move is worth $300.' },
      { q: 'What is the minimum price move on NQ, and what is it worth?', options: ['0.25 points, $5', '1 point, $20', '0.25 points, $0.50', '0.01 points, $0.20'], answer: 0, why: 'A tick is 0.25 points. At $20 per point that is $5 on NQ, and $0.50 on MNQ.' },
      { q: 'When is the US cash session?', options: ['08:30–15:00 New York time', '09:30–16:00 New York time', '18:00–17:00 New York time', '03:00–08:30 New York time'], answer: 1, why: 'The cash session runs 09:30–16:00 ET. Globex trades from 18:00 to 17:00 around it.' }
    ]
  },
  {
    slug: 'risk-first',
    title: 'Risk first: stops, size and R',
    minutes: 9,
    summary: 'Where a stop belongs, how many contracts to trade, and why R beats dollars for judging your trading.',
    blocks: [
      { p: 'Every trade starts with one question: where am I wrong? The answer is your stop. Only once you know the stop can you decide how many contracts to trade and whether the target is worth it.' },
      { h: 'Put the stop where the idea fails' },
      { ul: [
        'A stop belongs beyond the level that would prove the trade wrong: below the swing low for a long, above the swing high for a short.',
        'It also has to sit outside normal noise. A useful yardstick is the Average True Range (ATR), the average size of recent bars. A stop smaller than about half the 5-minute ATR is often hit by random movement.',
        'If the right stop is too far away for your budget, trade fewer contracts or skip the trade. Do not pull the stop closer to make the numbers work.'
      ] },
      { h: 'Size the position from the stop' },
      { p: 'Decide how much of the account one trade may lose, often 0.5% to 1%. Then: contracts = dollar risk ÷ (stop distance in points × point value).' },
      { ex: { title: 'Worked example', lines: [
        'Account $50,000, risking 0.5% = $250 per trade.',
        'Stop 25 points away on MNQ: 25 × $2 = $50 of risk per contract.',
        '$250 ÷ $50 = 5 MNQ. On NQ the same stop risks $500 per contract, double the budget, so NQ is too big for this trade.'
      ] } },
      { h: 'Measure trades in R' },
      { p: 'R is the amount you risked. A trade that makes twice its risk is +2R; a full stop-out is −1R. R lets you compare trades of different sizes and shows whether an edge is real.' },
      { ul: [
        'Expectancy = win rate × average win − loss rate × average loss. A 40% win rate with 2R winners and 1R losers gives 0.4 × 2 − 0.6 × 1 = +0.2R per trade.',
        'Planned reward-to-risk sets the win rate you need to break even: 1 ÷ (1 + R:R). At 2:1 you break even at 33%; with a target half the size of the stop you need 67%.',
        'Moving a stop further away after entry turns a 1R loss into a bigger one. Decide the stop, the target and any breakeven rule before you enter.'
      ] }
    ],
    terms: [
      ['R', 'The dollar amount you risk on one trade'],
      ['Expectancy', 'The average result per trade, in dollars or R'],
      ['ATR', 'Average True Range, the average size of recent bars'],
      ['MAE / MFE', 'How far a trade went against you and in your favour before it closed']
    ],
    practice: { task: 'Take three trades that each risk exactly 1R, using the stop distance in the ticket, and set every target at 2R. Afterwards compare the R column in the Trades tab with the dollar column.', start: 570, random: true, blind: true },
    quiz: [
      { q: 'Your account is $20,000 and you risk 1% per trade. Your stop is 20 points away. How many MNQ contracts?', options: ['2', '5', '10', '20'], answer: 1, why: '1% of $20,000 is $200. Each MNQ contract risks 20 × $2 = $40, so $200 ÷ $40 = 5 contracts.' },
      { q: 'If every trade has a 2:1 reward-to-risk, what win rate do you need to break even, ignoring costs?', options: ['50%', 'About 33%', 'About 67%', '25%'], answer: 1, why: 'Break-even win rate is 1 ÷ (1 + 2), about 33%. One +2R winner in three trades pays for two −1R losers.' },
      { q: 'Where should the stop go on a long trade?', options: ['Always a fixed 10 points below entry', 'Just under the entry so losses stay small', 'Below the level that would prove the trade wrong, outside normal noise', 'A simulator trade needs no stop'], answer: 2, why: 'The stop marks where the idea is wrong. Too tight and noise takes you out; size the position from the stop instead of squeezing it.' }
    ]
  },
  {
    slug: 'sessions-and-levels',
    title: 'Sessions and key levels',
    minutes: 8,
    summary: 'The Asia, London and New York sessions, the levels they leave behind, and how price reacts when it returns to them.',
    blocks: [
      { p: 'Price remembers where it turned. Earlier highs and lows are where many traders leave orders, so price often reacts when it gets back to them. Marking these levels before the open gives you a map for the day.' },
      { h: 'The levels worth marking' },
      { ul: [
        "The prior day's high and low, from its 09:30–16:00 session.",
        'The Asia high and low (18:00–03:00) and the London high and low (03:00–08:30).',
        'The overnight high and low: everything from 18:00 to the 09:30 open.',
        'The opening range: the high and low of the first 15 minutes after 09:30.'
      ] },
      { h: 'Three ways price reacts' },
      { ul: [
        'Rejection: price reaches the level and turns away. Buying just under a level like that leaves little room, which is why the coach flags entries straight into a key level.',
        'Break and retest: price closes through the level, comes back to test it from the other side, then carries on. The retest is usually the cleaner entry.',
        'Sweep: price pushes just through the level, fills the stops resting there, then closes back inside. Traders call this a liquidity grab, and it often comes before a reversal.'
      ] },
      { ex: { title: 'Example', lines: [
        'The London high is 21,410.00. At 09:42 price spikes to 21,416.25 and the 1-minute bar closes at 21,404.50.',
        'That is a sweep of the London high: buy stops above the level were filled and price closed back below it.',
        'A short with the stop a few ticks above 21,416.25 keeps the risk small and clearly defined.'
      ] } },
      { p: 'None of these patterns works every time. Levels tell you where to pay attention; what price does at the level tells you what to do.' }
    ],
    practice: { task: 'Start at 03:00. When London opens, mark the Asia high and low with horizontal lines; at 08:30 mark the London high and low. After 09:30, trade only a sweep or a break and retest of one of those levels.', start: 180, random: true, blind: true },
    quiz: [
      { q: 'Which hours make up the London session in this course (New York time)?', options: ['18:00–03:00', '03:00–08:30', '09:30–16:00', '08:30–09:30'], answer: 1, why: 'London runs 03:00–08:30 ET here. Asia is 18:00–03:00 and the cash session 09:30–16:00.' },
      { q: "Price pokes above the prior day's high, then the bar closes back below it. What is that called?", options: ['A breakout', 'A sweep, or liquidity grab', 'A gap fill', 'A trend continuation'], answer: 1, why: 'Pushing through a level to fill the orders there and closing back inside is a sweep. It often comes before a move the other way.' },
      { q: 'You want to buy a breakout above the London high. Which entry usually gives the better risk?', options: ['Buy one tick under the high before it breaks', 'Wait for a close above it and a retest from above', 'Buy at market the moment it touches', 'Short it instead'], answer: 1, why: 'A close above and a retest confirms the break and lets you put the stop just under the old high.' }
    ]
  },
  {
    slug: 'trend-tools',
    title: 'Trend tools: EMAs, VWAP, RSI and MACD',
    minutes: 8,
    summary: 'Reading trend with moving averages and VWAP, what RSI and MACD actually measure, and the mistakes they lead to.',
    blocks: [
      { p: 'Indicators summarise price; they do not predict it. Use each one to answer a single question: which way is the trend, how stretched is price, and is momentum fading?' },
      { h: 'Moving averages for direction' },
      { ul: [
        'An exponential moving average (EMA) gives recent bars more weight. The 9 and 21 EMAs follow short swings; the 50 shows the broader intraday trend.',
        'When the 20 EMA sits above the 50 on the 5-minute chart and price holds above both, the trend is up. Longs go with it, and the coach marks trades that fight it.',
        'Pullbacks to a rising 21 EMA are classic trend entries. Entries more than two ATR beyond it are usually late: that is chasing.'
      ] },
      { h: 'VWAP for the session average' },
      { p: 'VWAP is the average price weighted by volume since a session start, 18:00 or 09:30. Large traders benchmark their fills against it. Holding above VWAP means buyers control the session; repeated crosses usually mean a range day.' },
      { h: 'RSI and MACD for momentum' },
      { ul: [
        'RSI measures the speed of recent moves on a 0–100 scale. Readings above 70 or below 30 say momentum is strong, not that price must turn. In a strong trend RSI can stay above 70 for hours.',
        'MACD is the gap between a fast and a slow EMA. A MACD line crossing its signal line shows momentum shifting; a new price high with a lower MACD high (divergence) warns that the push is tiring.',
        'Use both as context for a level or a trend, not as signals on their own.'
      ] },
      { h: 'Time of day' },
      { p: 'The first 30 minutes after 09:30 have the widest bars of the day. Between about 12:00 and 13:30 New York time volume thins and breakouts fail more often. The coach notes entries in both windows.' }
    ],
    practice: { task: 'On the 1-minute chart, trade only pullbacks to the 21 EMA in the direction of the 5-minute trend (20 EMA above or below the 50). Skip any entry more than two ATR away from the 21 EMA.', start: 570, random: true, blind: true },
    quiz: [
      { q: 'RSI reads 78 during a strong rally. What does that tell you?', options: ['Price has to fall now', 'Momentum is strong, which is not a sell signal on its own', 'The market is closed', 'Volume is low'], answer: 1, why: 'High RSI means strong recent buying. In a trend it can stay high; wait for a level or a divergence before fading it.' },
      { q: 'On the 5-minute chart the 20 EMA is below the 50 and price is under both. Which trades go with the trend?', options: ['Longs', 'Shorts', 'Both equally', 'Neither'], answer: 1, why: 'The 20 under the 50 with price below both is a downtrend, so shorts go with it.' },
      { q: 'When do breakouts in NQ tend to fail more often?', options: ['09:30–10:00 ET', '12:00–13:30 ET', '15:00–16:00 ET', 'At 08:30 ET'], answer: 1, why: 'The lunch hours have thin volume, so moves often lack follow-through.' }
    ]
  },
  {
    slug: 'fair-value-gaps',
    title: 'Fair value gaps',
    minutes: 8,
    summary: 'What a fair value gap is, why price often returns to one, and how to use one for an entry and a stop.',
    blocks: [
      { p: 'When price moves fast it can leave an area of the chart that traded on one side only. A fair value gap (FVG) is a three-candle pattern that marks that area.' },
      { h: 'Spotting one' },
      { ul: [
        'Bullish FVG: the low of the third candle is above the high of the first. The space between them is the gap.',
        'Bearish FVG: the high of the third candle is below the low of the first.',
        'The middle candle is the large, fast one. Gaps that form right after a key level is taken out tend to matter more than small gaps in a choppy range.'
      ] },
      { h: 'Why price returns' },
      { p: 'The move through the gap happened with orders mostly on one side. Price often comes back into the gap before continuing, which traders call mitigation. In an uptrend a bullish gap below price is a place to look for a long; an unfilled bearish gap above price can act as resistance.' },
      { h: 'Using a gap' },
      { ul: [
        'Entry: a limit order at the near edge of the gap, in the direction of the trend. The coach points this out when you bought above a bullish gap you could have used.',
        'Stop: beyond the far edge of the gap, or beyond the first candle for more room.',
        'Failure: if a candle closes through the whole gap, the gap has failed. A failed gap often flips role and is called an inverted FVG (IFVG): a broken bullish gap can turn into resistance.'
      ] },
      { ex: { title: 'Example', lines: [
        '5-minute candles: candle 1 high 21,402.00, candle 3 low 21,409.50. The bullish FVG runs 21,402.00–21,409.50.',
        'A buy limit at 21,409.50 with a stop at 21,399.75 risks 9.75 points.',
        'If a 5-minute candle later closes below 21,402.00, the gap has failed. Look for shorts on a retest from below instead.'
      ] } },
      { p: 'Gaps are common, especially on choppy days, and many get run straight through. Combine them with trend and key levels rather than trading every one.' }
    ],
    practice: { task: 'On the 5-minute chart, wait for a fair value gap that forms in the direction of the trend. Use the long or short planner to place a limit at its near edge with the stop beyond the far edge.', start: 570, random: true, blind: true, tf: 5 },
    quiz: [
      { q: 'Which describes a bullish fair value gap?', options: ["Candle 3's low is above candle 1's high", "Candle 3's high is below candle 1's low", 'Candle 2 closes above its open', 'Price gaps up at the 09:30 open'], answer: 0, why: "A bullish FVG is the space between candle 1's high and candle 3's low, left by a strong up move in candle 2." },
      { q: 'Where does the stop usually go for a long entered at the top edge of a bullish FVG?', options: ['Inside the gap', 'Beyond the far, lower edge of the gap', 'At the top of the impulse candle', 'No stop is needed'], answer: 1, why: 'If price trades through the whole gap the idea has failed, so the stop goes beyond the far edge.' },
      { q: 'A 5-minute candle closes below a bullish FVG. What does that suggest?', options: ['The gap is stronger now', 'The gap failed and may act as resistance (an inverted FVG)', 'Buy more', 'Nothing changes'], answer: 1, why: 'A close through the gap invalidates it. Broken gaps often flip and act as resistance on a retest.' }
    ]
  },
  {
    slug: 'reviewing-trades',
    title: 'Reviewing your trades',
    minutes: 6,
    summary: 'Judging process instead of outcome, reading your stats, and turning recurring mistakes into rules.',
    blocks: [
      { p: 'One trade tells you almost nothing; fifty tell you a lot. The journal and the Stats page are there so you can see patterns that a single day hides.' },
      { h: 'Grade the decision, not the result' },
      { p: 'A trade that followed your plan and hit its stop is a good trade. A trade that broke your rules and made money is a bad one, because repeating it will cost you. After each trade ask: would I take it again with the same information?' },
      { h: 'The numbers that matter' },
      { ul: [
        'Expectancy in R, your average result per trade. Positive over 50 or more trades suggests an edge worth building on slowly.',
        'MAE, how far trades went against you. If winners rarely go more than 0.5R against you, your stops may be wider than they need to be.',
        'MFE, how far trades went in your favour. If trades often reach +1R and then lose, set a rule: stop to breakeven, or take part of the position off.',
        'P/L by hour and the recurring coach warnings show when you trade badly and which mistake costs the most.'
      ] },
      { h: 'Turn findings into rules' },
      { ul: [
        'Pick the mistake that appears most often on the Stats page and write one rule against it, for example: no new trade within five minutes of a loss.',
        'Keep the rule for the next twenty trades before adding another.',
        'Practise on blind days. Hiding the date stops you trading from memory of what that day did.'
      ] }
    ],
    practice: { task: 'Trade a full blind random day and take no more than three trades. When it ends, open the Stats page and note your most common coach warning and your average MAE.', start: 570, random: true, blind: true },
    quiz: [
      { q: 'You followed your plan exactly and the trade hit its stop for −1R. How should you grade it?', options: ['A bad trade: it lost money', 'A good trade: the process was right', 'It does not count', 'Move the stop further next time'], answer: 1, why: 'Losses are part of any edge. Judge whether the decision followed the plan, not the single outcome.' },
      { q: 'Your trades often run 1.5R in your favour and then come back to stop you out. Which rule fits?', options: ['Widen the stop', 'Move the stop to breakeven or take partial profit at +1R', 'Trade more often', 'Remove the target'], answer: 1, why: 'High MFE that turns into losses means the exit plan, not the entry, is leaking.' },
      { q: 'Why practise on random days with the date hidden?', options: ['It is faster', 'So you cannot trade from memory of what happened that day', 'Hidden days have better data', 'It doubles the P/L'], answer: 1, why: 'If you know the day, hindsight leaks into your decisions.' }
    ]
  }
];

export function practiceHref(l: Lesson) {
  const q = new URLSearchParams({ lesson: l.slug, start: String(l.practice.start) });
  if (l.practice.random) q.set('random', '1');
  if (l.practice.blind) q.set('blind', '1');
  if (l.practice.tf) q.set('tf', String(l.practice.tf));
  return `/replay?${q.toString()}`;
}
