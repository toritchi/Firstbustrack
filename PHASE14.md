# Phase 14 — Production Hardening & Security

Implemented security and reliability hardening without introducing new runtime dependencies.

## Security
- Request correlation IDs (`X-Request-ID`) on every HTTP request.
- Configurable CORS allow-list via `ALLOWED_ORIGINS`.
- Global in-memory API rate limiting and stricter authentication/OTP rate limiting.
- Reduced JSON request body limit to 256 KB.
- Raw request body capture for cryptographically correct payment webhook signatures.
- Payment webhook provider validation.
- `PAYMENT_WEBHOOK_SECRET` is mandatory in production.
- Helmet remains enabled.
- Consistent error responses include request IDs.
- Known database/business errors are normalized to appropriate HTTP status codes.

## Data integrity
- Refund provider reference persisted for traceability.
- Database checks protect non-negative payment amounts and valid approved refund amounts.

## Reliability
- `/health` remains a lightweight liveness endpoint.
- `/ready` verifies PostgreSQL and Redis availability.
- Graceful SIGTERM/SIGINT shutdown closes WebSocket clients, HTTP server, Redis and PostgreSQL pool.

## Testing
- Node syntax checks pass for Phase 14 source files.
- Security unit tests cover rate limiting and request IDs.
- Full PostgreSQL/Redis/MQTT integration tests require installed dependencies and running services and are not claimed as passed here.

## Production boundary
The rate limiter is process-local. For multi-instance production deployment it should be moved to a shared Redis-backed limiter before horizontal scaling. CORS must be configured with the actual web application origins; leaving `ALLOWED_ORIGINS` empty intentionally rejects browser cross-origin requests.
