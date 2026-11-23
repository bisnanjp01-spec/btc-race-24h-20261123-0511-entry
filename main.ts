// cbBTC 1-minute replay bot: patient dip + breakout entries, only with the
// slow trend behind them. (bars-replay/v1, NDJSON on stdin/stdout.)
//
// Why it mostly sits out: a full round trip costs ~26 bps (fee, slippage,
// impact) while a 1-minute bar usually moves ~7 bps, so random entries
// bleed. The bot waits for a stretched move that has already started to
// turn, and only when the slow trend agrees, so it is not catching a
// falling knife in a downtrend.
//
// Entry setups (one shared position, all cash in, all out):
//   1. DIP: price fell at least 120 bps over the last 20 bars, the
//      latest bar closed up, and the close is above the 240-bar mean.
//      A sharp short drop inside a slow uptrend.
//   2. RIDE: the 90-bar return just crossed above +70 bps and the
//      close is above its 90-bar mean. A fresh breakout into a grind.
//      The crossing test (previous bar's 90-bar return below the line)
//      stops re-entry on every bar of the same grind.
//
// Exits (measured from the entry fill, not from the decision close):
//   - take profit at +120 bps, or hard stop at -80 bps. The target is
//     wider than the stop because the setups only fire on stretched
//     moves that have room to run, while the tighter stop keeps a
//     failed turn cheap.
//   - 45-bar cooldown after every exit; no new entry in the last 45
//     bars of the 1,440-bar window, since a trade opened there could
//     not reach its target before the forced flatten.
//   - max_slippage_bps 200 so a violent gap cannot fill far from the
//     close the bot decided on.
//
// Deterministic: pure function of the bars. No clock, no randomness, no
// I/O. Prices stay far below 2^53, so both official executions agree.

const SYMBOL = "CBBTC";

// Strategy parameters (basis points unless noted).
const DIP_BARS = 20;
const DIP_FALL_BPS = 120;
const RIDE_BARS = 90;
const RIDE_BPS = 70;
const TREND_BARS = 240;
const TAKE_BPS = 120;
const STOP_BPS = 80;
const COOLDOWN_BARS = 45;
const WINDOW_BARS = 1440;
const TAIL_BARS = 45;
const MAX_SLIPPAGE_BPS = 200;
const MIN_NOTIONAL = 1000000; // 1 USDC in micro-USDC

type Bar = { symbol: string; c: string };
type Fill = { symbol: string; side: string; status: string; price: string };
type Position = { symbol: string; qty: string };
type Order = {
  side: string;
  client_id: string;
  symbol: string;
  qty?: string;
  notional_quote_units?: string;
  max_slippage_bps: number;
};

type State = {
  closes: number[];
  warmup: number;
  cooldown: number;
  entry: number; // fill price of the open position, 0 when flat
  seq: number;
};

const state: State = {
  closes: [],
  warmup: 0,
  cooldown: 0,
  entry: 0,
  seq: 0,
};

// Mean of closes[i - len, i): the last `len` closes ending at index i - 1.
function meanBefore(values: number[], i: number, len: number): number {
  let total = 0;
  for (let k = i - len; k < i; k++) total += values[k];
  return Math.floor(total / len);
}

// Return in bps from price `from` to price `to`, scaled by 10000.
function moveBps(from: number, to: number): number {
  return ((to - from) * 10000) / from;
}

function decide(): boolean {
  const { closes } = state;
  const n = closes.length;
  const close = closes[n - 1];
  if (state.cooldown > 0) state.cooldown -= 1;

  // Flat and past warmup: look for an entry.
  if (state.entry === 0 && n > state.warmup && n <= WINDOW_BARS - TAIL_BARS) {
    if (state.cooldown === 0) {
      let dip = false;
      if (n > DIP_BARS && n > TREND_BARS + 60) {
        const old = closes[n - 1 - DIP_BARS];
        // Slow trend direction, measured before the dip: the 240-bar
        // mean now vs 60 bars ago. A sharp 20-bar drop drags any
        // short mean down with it, so comparing the slow mean against
        // itself is the only trend test the dip cannot fake.
        const trendNow = meanBefore(closes, n, TREND_BARS);
        const trendWas = meanBefore(closes, n - 60, TREND_BARS);
        dip =
          moveBps(old, close) <= -DIP_FALL_BPS &&
          close > closes[n - 2] &&
          trendNow > trendWas;
      }
      let ride = false;
      if (n > RIDE_BARS) {
        const old = closes[n - 1 - RIDE_BARS];
        const oldPrev = closes[n - 2 - RIDE_BARS];
        const prev = closes[n - 2];
        const avg = meanBefore(closes, n, RIDE_BARS);
        ride =
          moveBps(old, close) >= RIDE_BPS &&
          moveBps(oldPrev, prev) < RIDE_BPS &&
          close > avg;
      }
      if (dip || ride) return true;
    }
    return false;
  }
  return false;
}

function main(): void {
  let orderNo = 0;
  let buffer = "";

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let idx = buffer.indexOf("\n");
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      idx = buffer.indexOf("\n");
      if (line.length > 0) handleLine(line);
    }
  });

  function handleLine(line: string): void {
    const msg = JSON.parse(line) as Record<string, unknown>;
    const kind = msg["type"];

    if (kind === "hello") {
      state.warmup = Number(msg["warmup_bars"] ?? 0);
      return;
    }
    if (kind === "done") {
      process.exit(0);
    }
    if (kind !== "batch") return;

    const seq = msg["seq"] as number;
    const account = (msg["account"] ?? {}) as Record<string, unknown>;
    const cash = Number(account["cash_quote_units"] ?? 0);
    const positions = (account["positions"] ?? []) as Position[];
    let held = 0;
    for (const pos of positions) {
      if (pos.symbol === SYMBOL) held = Number(pos.qty);
    }

    const fills = (msg["fills"] ?? []) as Fill[];
    for (const fill of fills) {
      if (fill.symbol !== SYMBOL || fill.status !== "filled") continue;
      if (fill.side === "buy") state.entry = Number(fill.price);
      else if (fill.side === "sell") state.entry = 0;
    }

    const bars = (msg["bars"] ?? []) as Bar[];
    let bar: Bar | null = null;
    for (const b of bars) {
      if (b.symbol === SYMBOL) {
        bar = b;
        break;
      }
    }

    const orders: Order[] = [];
    if (bar !== null) {
      state.closes.push(Number(bar.c));
      const close = state.closes[state.closes.length - 1];

      if (held > 0 && state.entry > 0) {
        // Exit at the fixed target or the tighter stop.
        if (
          moveBps(state.entry, close) >= TAKE_BPS ||
          moveBps(state.entry, close) <= -STOP_BPS
        ) {
          orderNo += 1;
          orders.push({
            side: "sell",
            client_id: "sell-" + orderNo,
            symbol: SYMBOL,
            qty: String(held),
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          });
          state.cooldown = COOLDOWN_BARS;
          // entry clears when the sell fill arrives, not here: if this
          // sell were rejected, the position is still open and the exit
          // must fire again next bar.
        }
      } else if (held === 0) {
        if (decide() && cash >= MIN_NOTIONAL) {
          orderNo += 1;
          orders.push({
            side: "buy",
            client_id: "buy-" + orderNo,
            symbol: SYMBOL,
            notional_quote_units: String(cash),
            max_slippage_bps: MAX_SLIPPAGE_BPS,
          });
        }
      }
    }

    process.stdout.write(
      JSON.stringify({ type: "reply", seq, orders }) + "\n",
    );
  }
}

main();
