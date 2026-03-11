# EdgeMarkets Backend

Fastify + TypeScript backend for EdgeMarkets live Polymarket execution.

## What is implemented
- Live Polymarket market ingestion from Gamma API with seed fallback.
- Real signed wallet auth via challenge + signature verification.
- Web-to-extension session handoff.
- Strategy, follow, trigger-job, audit-log, and order-history APIs.
- Persisted live order lifecycle records: `submitted`, `open`, `filled`, `failed`, `retried`.
- Creator performance and strategy history endpoints.
- MongoDB primary store with automatic memory fallback for local dev.
- Dockerfile and GitHub Actions CI.

## Key routes
- `GET /api/markets`
- `GET /api/polymarket/profile/:walletAddress`
- `POST /api/auth/challenge`
- `POST /api/auth/verify`
- `GET /api/auth/sessions/me`
- `POST /api/auth/handoff/request`
- `POST /api/auth/handoff/consume`
- `GET /api/runtime/config`
- `GET /api/strategies`
- `GET /api/strategies/:strategyId`
- `POST /api/strategies`
- `POST /api/strategies/:strategyId/follows`
- `GET /api/strategies/:strategyId/history`
- `GET /api/users/:userId/follows`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/creators/:creatorHandle/performance`
- `GET /api/trigger-jobs`
- `POST /api/trigger-jobs`
- `GET /api/execution-logs`
- `GET /api/audit-logs`

## Local run
```bash
npm install
npm run dev
```

## Environment
Copy `.env.example` to `.env`.

Important defaults now target live Polymarket infrastructure:
- `EXECUTION_MODE=live`
- `NETWORK_MODE=mainnet`
- `POLYGON_NETWORK=polygon`
- `POLYMARKET_HOST=https://clob.polymarket.com`
- `POLYMARKET_GAMMA_HOST=https://gamma-api.polymarket.com`
- `POLYMARKET_CHAIN_ID=137`
- `POLYMARKET_MARKET_SOURCE=live`
- `TRIGGER_WORKER_ENABLED=false`

## Tests
```bash
npm run test
npm run typecheck
npm run build
```
