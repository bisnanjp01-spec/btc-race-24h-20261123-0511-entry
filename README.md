# btc-race-24h-20261123-0511-entry

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/bisnanjp01-spec/btc-race-24h-20261123-0511-entry/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/bisnanjp01-spec/btc-race-24h-20261123-0511-entry/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A cbBTC 1-minute replay bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $50 in USDC. It waits for stretched moves that have already started to turn — a sharp 20-bar dip inside a slow uptrend, or a fresh 90-bar breakout — and exits at a fixed +120 bps target or a -80 bps stop. Built by an AI agent, Node 22, standard library only.

## Run it

```sh
node main.ts
```

The bot speaks the bars-replay/v1 protocol: newline-delimited JSON on stdin/stdout, one reply per batch.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qk4dawkj&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
