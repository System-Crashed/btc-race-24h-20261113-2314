// Capitulation Bounce (confirmed): a long-only dip-buyer for cbBTC on 1-minute bars.
//
// Idea: the dev window is a choppy downtrend (BTC -4.9% over 24h) whose one
// large bounce (+1.76% over 60 bars) follows a sharp 10-bar drop of -1.00%.
// The drop and its reversal rarely share one bar, and a single up-bar inside
// a larger drop is a dead-cat bounce: an earlier variant bought one at bar
// 403 and was stopped out at the bar-406 bottom, missing the rise entirely.
// So this bot remembers a sharp drop for a few bars and buys only the first
// TWO consecutive up closes after it — a confirmed reversal, not a blip —
// then exits patiently: a wide take-profit and stop, a long hold, no trailing
// stop (which cut slow rises short).
//
//   - Entry: a 10-bar return below -0.8% (a sharp capitulation) within the last
//     5 bars, AND two consecutive up closes (the bounce is confirmed). Buys
//     half the equity.
//   - Exit (whole position): worth >= 101.2% of its cost (+1.2% take-profit),
//     worth <= 99.4% of its cost (-0.6% stop), or held 90 bars (time cap).
//   - Every rule is read again on each bar, so a sell the market refuses is sent
//     again on the next bar while its reason still holds.
//   - Slippage is capped at 100 bps past the close it was decided on, so an order
//     into a liquidity gap is refused (and retried) rather than filled badly.
//   - The drop is a float64 ratio of two close prices; the entry/exit money
//     tests use exact bigint ratios of the position's worth (at the latest
//     close) to its cost (fees included), so the same bars give the same
//     orders, run after run.
//
// Laid out like an entrant's repository: the grader runs `node /bot/main.ts` with
// this directory mounted at /bot; vendor/makefun-bars.ts is a byte-identical copy
// of the kit's sdk/makefun-bars.ts.

import { BPS, runBars, type BarsState, type BuyInput, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Capitulation: the 10-bar return at or below this (as a fraction) to arm. */
const DROP_BARS = 10;
const DROP_FRACTION = -0.008;
/** How many bars after a sharp drop the reversal may come. */
const ARM_BARS = 5;
/** Take-profit: worth 101.2% of the position's cost. */
const PROFIT_NUM = 1012n;
/** Stop-loss: worth 99.4% of the position's cost. */
const STOP_NUM = 994n;
const EXIT_DEN = 1000n;
/** Time cap: exit after this many bars held. */
const MAX_HOLD_BARS = 90;
/** Position size: half the equity per entry. */
const POSITION_BPS = 5000;
const MAX_SLIPPAGE_BPS = 100;

/** Latest closes as numbers, oldest first. */
const closes: number[] = [];
/** The bar index of the most recent sharp drop, or -1 if none. */
let dropBar = -1;
/** Bars the current position has been held. */
let barsHeld = 0;

await runBars({
  onBatch(state, batch) {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const closeNum = Number(close);
    const prevClose = closes.length > 0 ? closes[closes.length - 1] : null;
    const prevPrevClose = closes.length > 1 ? closes[closes.length - 2] : null;
    const tenAgo = closes.length >= DROP_BARS ? closes[closes.length - DROP_BARS] : null;
    closes.push(closeNum);
    const orders: OrderInput[] = [];
    const pos = state.positions.get(SYMBOL);

    if (pos !== undefined) {
      barsHeld++;
      const worth = state.value(SYMBOL, pos.qty);
      const cost = pos.cost;
      const profitHit = worth * EXIT_DEN >= cost * PROFIT_NUM;
      const stopHit = worth * EXIT_DEN <= cost * STOP_NUM;
      const timeUp = barsHeld >= MAX_HOLD_BARS;
      if (profitHit || stopHit || timeUp) {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: pos.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        barsHeld = 0;
      }
      return orders;
    }

    if (state.warmingUp) return [];
    // Arm on a sharp drop; buy the first two consecutive up closes within
    // ARM_BARS after it (a confirmed reversal, not a dead-cat bounce).
    if (tenAgo !== null && (closeNum - tenAgo) / tenAgo <= DROP_FRACTION) dropBar = batch.seq;
    const armed = dropBar >= 0 && batch.seq - dropBar <= ARM_BARS;
    const twoUp = prevClose !== null && prevPrevClose !== null && closeNum > prevClose && prevClose > prevPrevClose;
    if (armed && twoUp) {
      const { caps, fees } = state.hello;
      const byWeight = state.weightRoom(SYMBOL);
      const slice = (state.equity * BigInt(POSITION_BPS)) / BPS;
      const notional = slice < byWeight ? slice : byWeight;
      if (notional > 0n && notional >= BigInt(fees.min_notional_quote_units)) {
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS };
        barsHeld = 0;
        dropBar = -1;
        return [buy];
      }
    }
    return [];
  },
});
