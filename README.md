# EdgeMarkets Backend

TypeScript backend for EdgeMarkets strategy marketplace MVP.

## Stack
- Fastify
- TypeScript (`strict`)
- MongoDB (default persistence provider)

## Structure
```txt
src/
  app.ts
  index.ts
  config/
  domain/
  repositories/
  routes/
  services/
  utils/
```

## Features
- `GET /api/health`
- `GET /api/markets`
- `GET /api/stablecoins`
- `GET /api/runtime/config`
- `POST /api/runtime/simulate-follow`
- `GET /api/strategies`
- `POST /api/strategies`
- `POST /api/strategies/:strategyId/follows`
- `GET /api/users/:userId/follows`

`POST /api/strategies/:strategyId/follows` expects:
- `userId`
- `maxDailyLossUsd`
- `maxMarketExposureUsd`
- `fundingStablecoin` (`USDC`, `USDT`, `DAI`)

## Execution Phases (Backend)
### Phase 1: Core API (done)
- `Chunk 1.1`: Domain models + validators + in-memory repo
- `Chunk 1.2`: Strategy/follow/market endpoints
- `Chunk 1.3`: Stablecoin-aware follow payload

### Phase 2: Testnet Runtime (in progress)
- `Chunk 2.1`: Runtime config endpoint for testnet mode
- `Chunk 2.2`: CORS/origin policy for web + extension clients
- `Chunk 2.3`: Execution simulation contract for dry-run orders

### Phase 3: Durable Execution (in progress)
- `Chunk 3.1`: MongoDB persistence provider + seed + repository abstraction
- `Chunk 3.2`: Job queue for trigger processing
- `Chunk 3.3`: Audit trail + idempotent order lifecycle

## Run
```bash
npm install
npm run dev
```

Backend runs at `http://localhost:4000`.

## Environment
Copy `.env.example` to `.env` if you need custom values.

Testnet-first defaults:
- `NETWORK_MODE=testnet`
- `POLYGON_NETWORK=amoy`
- `EXECUTION_MODE=simulated`
- `STORE_PROVIDER=mongodb`
- `MONGODB_URI=mongodb://127.0.0.1:27017`
- `MONGODB_DATABASE=edgemarkets`

Extension/web origin defaults:
- `ALLOWED_ORIGINS=http://localhost:3000,https://polymarket.com,https://*.polymarket.com,chrome-extension://*`
