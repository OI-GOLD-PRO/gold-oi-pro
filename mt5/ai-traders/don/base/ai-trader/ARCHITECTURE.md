# OI Gold AI Trader — integration design (draft)

This is a **separate web application**, not a modification to the existing OI Gold Pro UI. Do not deploy or merge without integration tests.

## Services
- Dashboard (separate origin): authenticated account status, risk controls, positions, AI decisions and daily journal.
- Backend: MT5 bridge, DeepSeek client, OI Gold Pro read-only adapter, event journal and risk-policy service.
- MT5 EA: periodically polls signed commands, submits orders, reports executions and positions, enforces independent risk caps and an emergency stop.
- OI Gold Pro adapter: read-only integration with existing API/Sheets, field mapping and freshness/contract-expiry validation; no assumed endpoints.

## Data contracts
- market_snapshot: symbol, broker, timeframe=M5, closed_bar_time_utc, OHLCV, spread, account equity, positions.
- oi_snapshot: source, as_of_utc, contract, expiry, strike, call_oi, put_oi, options_volume, gamma, iv, em, delta, big_trade, footprint, volume_profile; nullable fields never fabricated.
- risk_policy: account_id, version, max_risk_per_trade_pct, max_total_open_risk_pct, max_daily_loss_pct, max_positions, allowed_symbols, allow_hedging, enabled, updated_at.
- ai_decision: decision_id, account_id, market_snapshot_id, oi_snapshot_id, model, timestamp_utc, action, proposed_risk_pct, proposed_sl, proposed_tp, rationale, confidence_optional.
- execution_event: decision_id, idempotency_key, order_ticket, deal_ticket, requested_action, actual_action, fill_price, volume, fees, realized_pnl, timestamp_utc, rejection_reason.

## Safety invariants
- Backend and EA each enforce the latest approved risk-policy limits. AI proposals cannot increase limits.
- Default state is DEMO / no live execution; explicit activation is required after verification.
- Fail closed on stale/missing data, malformed AI output, disconnected bridge, or unknown policy version.
- Use broker symbol properties and OrderCalcProfit/OrderCalcMargin to size lots; include open positions and pending orders in portfolio risk; reject when broker minimum lot exceeds budget.
- Do not rely on AI to enforce stop losses. Check stop levels, freeze levels, spread, margin, hedging/netting account mode and duplicate decisions.
- Limit total risk across simultaneous positions; use unique idempotency keys, persistent journal, and broker reconciliation after restart.
- Daily journal uses broker executions as the source of truth, not AI predictions.
- Keep API keys server-side in secret storage; MT5 uses scoped, rotatable credentials; require HTTPS and authentication.

## Delivery phases
1. Inspect existing OI Gold Pro API schemas and map supported fields; verify data freshness.
2. Implement read-only OI adapter and authenticated dashboard with persisted risk policies and journal.
3. Build DeepSeek structured-decision service with schema validation and auditable prompts.
4. Build MT5 EA bridge, risk-controller parity and reconciliation, demo-only tests.
5. Paper trading, MT5 demo forward tests, then explicit live enablement.

Status: the local dashboard reads the existing /opt feed through a read-only Node service. See README for live field coverage and pending sources. The demo-only MT5 decision bridge, persistent risk policy and daily execution journal are implemented for local installation. End-to-end broker validation requires a Windows MT5 demo terminal and DeepSeek key.
