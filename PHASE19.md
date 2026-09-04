# Phase 19 — API Contract & OpenAPI Documentation

## Delivered
- OpenAPI 3.0.3 contract at `backend/docs/openapi.json`.
- Documentation for all Express HTTP routes currently implemented.
- Bearer JWT security scheme for protected API operations.
- Standard error response schemas.
- Path parameter documentation for resource IDs.
- Contract parity test: `npm run test:contract`.

## QA
- OpenAPI contract parity: PASS — 111/111 Express routes documented.
- New JavaScript syntax check: PASS.

## Deliberate limitation
The authoritative endpoint-by-endpoint API specification was not available in the project artifacts. Therefore this phase documents the implemented route surface and common contract structure without inventing detailed request/response fields. Existing runtime Zod/database validation remains authoritative until the formal API contract is supplied.
