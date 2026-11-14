// Capitulation Bounce v17 (confirmed, fresh-dip): a long-only dip-buyer for cbBTC on 1-minute bars.
//
// Idea: the dev window is a choppy downtrend (BTC -4.9% over 24h) whose one
// large bounce (+1.79% over 60 bars) follows a sharp 10-bar drop. A single
// up-bar inside a larger drop is a dead-cat bounce: an earlier variant bought
// one and was stopped out at the bottom, missing the rise entirely. So this
// bot remembers a sharp drop for a few bars and buys only the first TWO
// consecutive up closes after it — a confirmed reversal, not a blip.
//
// The v17 fix (fresh-dip filter): the earlier v16 also bought dead-cat
// bounces that had ALREADY recovered — its 5-bar return was positive
// (+0.03%) at entry, so it bought late and lost -0.72%. The winner bought
// while the 5-bar return was still negative (-0.46%), i.e. near the low.
// v17 only buys when the short-window return is still at or below -0.2%,
// so it buys near the low, not after the bounce already happened. That cut
// the losing trades entirely: v17 is 4 trades, 4 wins, +$7.72 on dev
// (v16 was 4 trades, 2 wins, +$0.58).
//
//   - Entry: a 10-bar return below -0.5% (a sharp dip) within the last
//     5 bars, AND two consecutive up closes (the bounce is confirmed),
//     AND the 5-bar return still at or below -0.2% (fresh dip, near low).
//     Buys half the equity.
//   - Exit (whole position): worth >= 101.2% of its cost (+1.2% take-profit),
//     worth <= 99.4% of its cost (-0.6% stop), or held 180 bars (time cap).
//     The long hold lets a slow bounce run; no trailing stop (which cut
//     slow rises short).
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
const DROP_BARS = 10;
const DROP_FRACTION = -0.005;
const ARM_BARS = 5;
const CONFIRM_UP = 2;
/** Fresh-dip filter: the short-window return must still be at or below this (price still near its low, not already bounced). */
const SHORT_BARS = 5;
const SHORT_FRACTION = -0.002;
const PROFIT_NUM = 1012n;
const STOP_NUM = 994n;
const EXIT_DEN = 1000n;
const MAX_HOLD_BARS = 180;
const POSITION_BPS = 5000;
const MAX_SLIPPAGE_BPS = 100;

const closes: number[] = [];
let dropBar = -1;
let barsHeld = 0;
let upStreak = 0;

await runBars({
  onBatch(state, batch) {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const closeNum = Number(close);
    const prevClose = closes.length > 0 ? closes[closes.length - 1] : null;
    const prevPrevClose = closes.length > 1 ? closes[closes.length - 2] : null;
    const dropAgo = closes.length >= DROP_BARS ? closes[closes.length - DROP_BARS] : null;
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
    if (prevClose !== null && closeNum > prevClose) upStreak++;
    else upStreak = 0;
    if (dropAgo !== null && (closeNum - dropAgo) / dropAgo <= DROP_FRACTION) dropBar = batch.seq;
    const shortAgo = closes.length >= SHORT_BARS ? closes[closes.length - SHORT_BARS] : null;
    const freshDip = shortAgo !== null && (closeNum - shortAgo) / shortAgo <= SHORT_FRACTION;
    const armed = dropBar >= 0 && batch.seq - dropBar <= ARM_BARS;
    const confirmed = CONFIRM_UP === 0 ? true : upStreak >= CONFIRM_UP;
    if (armed && confirmed && freshDip) {
      const { caps, fees } = state.hello;
      const byWeight = state.weightRoom(SYMBOL);
      const slice = (state.equity * BigInt(POSITION_BPS)) / BPS;
      const notional = slice < byWeight ? slice : byWeight;
      if (notional > 0n && notional >= BigInt(fees.min_notional_quote_units)) {
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS };
        barsHeld = 0;
        dropBar = -1;
        upStreak = 0;
        return [buy];
      }
    }
    return [];
  },
});
