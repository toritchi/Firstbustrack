# Phase 18 — Deterministic Full-System E2E QA

Phase 18 extends Phase 17 with a deterministic, business-chain E2E scenario and a test-data reset utility.

## Commands

```bash
npm run test:reset
npm run e2e:full
npm run test:all
```

The full E2E flow covers admin authentication/RBAC, public transport data, passenger OTP, trip state transitions, payment creation and signed webhook idempotency, ticket issuance, validator idempotency, occupancy board/exit, service alerts, notification preferences, partial refunds including provider reference persistence, reporting, and MQTT telemetry/live tracking.

## Environment

Use the Phase 17 test compose stack and `.env.e2e.example`. Start dependencies, run migrations, seed test data, then execute `e2e:full`.

## Verification in this build environment

Node syntax checks for the new scripts pass. Live PostgreSQL/Redis/EMQX execution could not be completed because Docker is unavailable and `npm install` timed out. No live E2E pass is claimed here.
