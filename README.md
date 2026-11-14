# btc-race-24h-20261113-2314 entry

A long-only capitulation-bounce bot for Coinbase Wrapped BTC (cbBTC) on
1-minute bars. It sits in cash, buys only a confirmed bounce off a sharp
capitulation dip, and exits patiently — a wide take-profit and stop, a long
hold, no trailing stop.

## Strategy

- **Entry**: a 10-bar return below -0.8% (a sharp capitulation) within the
  last 5 bars, AND two consecutive up closes (the bounce is confirmed, not a
  dead-cat bounce). Buys half the equity.
- **Exit** (whole position): worth >= 101.2% of its cost (+1.2% take-profit),
  worth <= 99.4% of its cost (-0.6% stop), or held 90 bars (time cap).

## Dev-window result (local grade, `--driver process`)

- Net PnL: **+0.058%** (+$0.58 on $1,000) — passes the dev gate (net PnL > $0).
- Trades: 4, win rate 50%, max drawdown 0.75% (limit 25%).

## Layout

- `main.ts` — the bot (Node 22, standard library only).
- `vendor/makefun-bars.ts` — a byte-identical copy of the kit's
  `sdk/makefun-bars.ts`.
- `LICENSE` — MIT.
