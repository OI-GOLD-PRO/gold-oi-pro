# OI Gold AI Trader

Run with Node.js 20+ from the repository root.

```sh
node ai-trader/server.mjs
```

Open http://127.0.0.1:4173/. The dashboard reads `GET /api/oi-snapshot` from the same local server and refreshes once per minute while visible. The server listens on loopback and serves the options feed via GET. Risk settings remain local to the browser. Set DEEPSEEK_API_KEY in the server environment to enable on-demand Thai analysis. DEEPSEEK_MODEL optionally selects the model. Open the numeric loopback URL above. MT5, execution and the daily journal still await integration.

## OI Gold Pro data

| Data | Source and handling |
| --- | --- |
| Contract, expiry and futures reference | Existing Worker `/opt`. Expiry date is the contract date in Chicago. Time fields in the API are UTC. |
| OI | `/opt` rows index 11, with separate `oiT` timestamp and `oiSrc` source. Coverage counts reported sides. Missing values remain null. OI from a different contract in `oiFb` is excluded. OI can have an older reporting time than the options quotes. |
| Options Volume and per-option Gamma | `/opt` rows indices 8 and 4. Gamma and IV by strike are labeled as feed values. |
| ATM IV | The existing Black-76 `liveIV` calculator in `scripts/vol.mjs`, using qualifying quotes during the market session. Returned as an annualized percentage. |
| EM, intraday Gamma Flip and GEX | `em`, `itd` and `gexItd` from `/opt`. EM is published only alongside available ATM IV. |
| Delta | Opposite Delta Worker source exists under `workers/opposite-delta`. It uses Binance XAUUSDT and is separate from options delta. Its deployment URL and live coverage need verification. |
| Big Trade, Footprint and Volume Profile | The chart aggregates exchange trades through `bigtrade.js`, `volume-profile.js` and `footprint.js`. Server-side ingestion remains pending. |
| Sheet and historical OI | The chart has authenticated Apps Script routes `api=data` and `api=oi_history`. This adapter reads `/opt` and requires no Apps Script access code. |

Quote timestamps are checked against the same 15-minute freshness window used by the hourly backup. Expired, stale, missing and implausibly future timestamps return metadata with empty market rows. Upstream failures return HTTP 502. The feed covers the selected contract and the strikes available from `/opt`.

## MT5 daily journal

Compile OI_Trader_Journal.mq5 in MetaEditor and attach it to a separate chart in the account to monitor. The exporter records BUY/SELL deals from all symbols and magic numbers for the last 30 broker dates. Its Experts log prints the file path. Set OI_JOURNAL_FILE to that path before starting the Node server on the same PC. The dashboard shows the last broker export time. Daily net sums profit, swap, commission and fee on those deals, including entry costs booked that day. Separate balance adjustments and commission-only ledger entries are outside this total.
