# Phase 17 — Real Integration & End-to-End Test Environment

## Delivered
- Reproducible test Compose stack for PostgreSQL/PostGIS, Redis and EMQX using isolated host ports.
- Deterministic test-data seeder covering geography, route, stops, bus, device, driver, trip, ticket offer and admin authentication.
- Automated E2E runner covering health/readiness, admin authentication, passenger OTP, payment webhook, ticket issuance, validator validation, occupancy, service alerts, reporting and MQTT live tracking.
- `npm run e2e` and `npm run seed:test` scripts.
- E2E environment template.

## Execution
1. Start test infrastructure with `docker compose -f docker-compose.test.yml up -d`.
2. Set `DATABASE_URL`, `REDIS_URL`, `MQTT_URL`, `JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET` from `.env.e2e.example`.
3. Run `npm ci` in `backend/`.
4. Run `npm run migrate`.
5. Run `npm run seed:test`.
6. Run `npm run e2e`.

The current build environment does not provide Docker, PostgreSQL, Redis or EMQX, so live E2E execution is intentionally not reported as passed here.
