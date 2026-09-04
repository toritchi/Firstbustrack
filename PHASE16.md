# Phase 16 — Production Infrastructure & Deployment

## Delivered
- Production Docker image for the Node.js API.
- Multi-container Compose stack: PostgreSQL/PostGIS, Redis, EMQX, migration job, API.
- Dependency health checks and startup ordering.
- One-shot migration container that must complete before API startup.
- Production environment template with required secrets/configuration.
- API container runs as the non-root `node` user.
- API `/ready` healthcheck used by Docker Compose.
- Minimal Prometheus-compatible `/metrics` endpoint for API/dependency liveness.
- Graceful shutdown from the previous phase retained.

## Deployment
1. Copy `.env.production.example` to `.env` and replace all CHANGE_ME values.
2. Set `ALLOWED_ORIGINS` to the exact production web origins.
3. Run `docker compose build`.
4. Run `docker compose up -d`.
5. Confirm `docker compose ps` reports postgres, redis, emqx and api healthy and migrate exited successfully.
6. Check `/health`, `/ready`, and `/metrics`.

## Verification
- JavaScript syntax checks: PASS.
- Dockerfile/Compose static inspection: PASS.
- Full container/database integration execution is not claimed unless Docker services are actually started in the target environment.
