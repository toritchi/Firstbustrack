# API Contract — Phase 19

`openapi.json` is the machine-readable OpenAPI 3.0.3 description of the currently implemented HTTP route surface.

## Validation

Run from `backend/`:

```bash
npm run test:contract
```

The contract test compares every Express route declared in `src/app.js` with the OpenAPI path/method set and fails on missing or undocumented routes.

## Scope

This phase documents the implemented API surface without inventing endpoint-specific fields that were not available in the authoritative API contract. The existing Zod/database business validation remains the runtime source of truth until a formal endpoint contract is supplied.
