# OI Gold AI Trader

Run with Node.js 20+ from the repository root.

```sh
node ai-trader/server.mjs
```

Open http://127.0.0.1:4173/. The dashboard reads `GET /api/oi-snapshot` from the same local server and refreshes once per minute while visible. The server listens on loopback and serves the options feed via GET. Risk settings persist on the local server. Set DEEPSEEK_API_KEY in the server environment to enable on-demand Thai analysis. DEEPSEEK_MODEL optionally selects the model. Open the numeric loopback URL above. See the demo bridge setup below.

## OI Gold Pro data

| Data | Source and handling |
| --- | --- |
| Contract, expiry and futures reference | Existing Worker `/opt`. Expiry date is the contract date in Chicago. Time fields in the API are UTC. |
| OI | `/opt` rows index 11, with separate `oiT` timestamp and `oiSrc` source. Coverage counts reported sides. Missing values remain null. OI from a different contract in `oiFb` is excluded. OI can have an older reporting time than the options quotes. |
| Options Volume and per-option Gamma | `/opt` rows indices 8 and 4. Gamma and IV by strike are labeled as feed values. |
| ATM IV | The existing Black-76 `liveIV` calculator in `scripts/vol.mjs`, using qualifying quotes during the market session. Returned as an annualized percentage. |
| EM, intraday Gamma Flip and GEX | `em`, `itd` and `gexItd` from `/opt`. EM is published only alongside available ATM IV. |
| Delta | Opposite Delta Worker source exists under `workers/opposite-delta`. It uses Binance XAUUSDT and is separate from options delta. Its deployment URL and live coverage need verification. |
| Big Trade, Footprint and Volume Profile | The demo bridge aggregates one closed M5 interval on the server. The chart also aggregates exchange trades through `bigtrade.js`, `volume-profile.js` and `footprint.js`. Chart-specific lookback and exchange selections may differ. |
| Sheet and historical OI | The chart has authenticated Apps Script routes `api=data` and `api=oi_history`. This adapter reads `/opt` and requires no Apps Script access code. |

Quote timestamps are checked against the same 15-minute freshness window used by the hourly backup. Expired, stale, missing and implausibly future timestamps return metadata with empty market rows. Upstream failures return HTTP 502. The feed covers the selected contract and the strikes available from `/opt`.

## MT5 daily journal

Compile OI_Trader_Journal.mq5 in MetaEditor and attach it to a separate chart in the account to monitor. The exporter records BUY/SELL deals from all symbols and magic numbers for the last 30 broker dates. Its Experts log prints the file path. Set OI_JOURNAL_FILE to that path before starting the Node server on the same PC. The dashboard shows the last broker export time. Daily net sums profit, swap, commission and fee on those deals, including entry costs booked that day. Separate balance adjustments and commission-only ledger entries are outside this total.

## Run the MT5 demo bridge on Windows

Use the entire branch checkout so the shared volatility module in scripts/ is available. Start Start-Demo.ps1 on the MT5 PC. Enter the DeepSeek key locally and use the exact demo login, server and symbol. The launcher stores a generated bridge token and separates the policy and decision journal by broker account. Open http://127.0.0.1:4173/. The dashboard runs on that PC.

Compile OI_Trader_Demo.mq5 and OI_Trader_Journal.mq5 in MetaEditor. In MT5 Options → Expert Advisors, allow WebRequest to http://127.0.0.1:4173. Attach the trading EA once to the configured gold M5 chart on a demo hedging account, enter InpBridgeToken, then enable InpEnableTrading and Algo Trading. Attach the journal exporter to a second chart. Set risk limits and enable demo trading from the dashboard. First contact occurs after a new M5 bar. Review results in Experts and the daily journal.

Decisions use closed M5 candles, broker prices, options and Binance XAUUSDT trades from the most recent completed five-minute interval when available. Flow uses 0.1 price buckets and a default threshold of 5 for big trades (OI_BIG_TRADE_MIN). Missing flow is passed as null. The server records decisions before returning them to MT5. Only the broker journal confirms execution. Opening deals carry the decision ID; closing deals inherit the entry rationale when the entry is in the exported period. The EA enforces the lower of dashboard and EA input risk caps. It defers new entries if there are pending orders or positions outside its own symbol and magic number. Daily equity reference is taken at the first EA observation for that broker day.

### Optional phone dashboard

For HTTPS on the same network or a private VPN, set OI_MOBILE_ORIGIN to the full HTTPS origin reachable from the phone (including the port), OI_TLS_CERT and OI_TLS_KEY to a certificate and matching private key for that host, and OI_MOBILE_PASSWORD to a private password of at least 24 characters before launching. Sign in with username dashboard. The phone must trust the certificate. By default only the PC loopback listener starts. MT5 always connects through loopback.
