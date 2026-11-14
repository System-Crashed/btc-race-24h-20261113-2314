# btc-race-24h-20261113-2314 entry

A long-only capitulation-bounce bot for Coinbase Wrapped BTC (cbBTC) on
1-minute bars. It sits in cash, buys only a confirmed bounce off a sharp
capitulation dip, and exits patiently — a wide take-profit and stop, a long
hold, no trailing stop.

## Strategy (v17)

- **Entry**: a 10-bar return below -0.5% (a sharp dip) within the last
  5 bars, AND two consecutive up closes (the bounce is confirmed, not a
  dead-cat bounce), AND the 5-bar return still at or below -0.2% (a fresh
  dip — the price is still near its low, not already bounced). Buys half
  the equity.
- **Exit** (whole position): worth >= 101.2% of its cost (+1.2% take-profit),
  worth <= 99.4% of its cost (-0.6% stop), or held 180 bars (time cap).

The fresh-dip filter is the v17 fix: v16 also bought dead-cat bounces that
had already recovered (5-bar return positive at entry) and lost -0.72% on
them. Requiring the short-window return to still be negative keeps only
the buys near the low. That cut the losing trades entirely.

## Dev-window result (local grade, `--driver process`)

- Net PnL: **+0.772%** (+$7.72 on $1,000) — passes the dev gate (net PnL > $0).
- Trades: 4, win rate 100%, max drawdown 0.36% (limit 25%).
- Fees: $0.81; at 2x fees net PnL is still +$6.91.

(v16 was 4 trades, win rate 50%, +$0.58. v17 is a 13x improvement.)
