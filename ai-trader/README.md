# OI Gold AI Trader — dashboard prototype

Open `index.html` locally to view the responsive dashboard, or serve the `ai-trader/` directory as static files.

**Status: UI prototype only.** All account and feed statuses are explicitly offline; there are no simulated trades presented as real. Risk settings persist in browser localStorage for layout testing only. They do not reach an EA or server.

Before live integration: authenticated backend, encrypted secrets, DeepSeek structured output validation, read-only OI adapter with freshness checks, MT5 bridge with idempotent commands, broker reconciliation, risk limits enforced on both server and EA, and demo forward tests. Never put DeepSeek keys in frontend code.

This app is isolated in `ai-trader/` and does not modify OI Gold Pro pages.
