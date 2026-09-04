# Algeria Bus Platform — Final MVP Release

This package contains the completed application-layer MVP through Phase 36.

## Quick start

### Backend
```bash
cd backend
cp .env.example .env
npm install
npm run migrate
npm start
```

### Frontend
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

### Production stack
```bash
cp .env.production.example .env
# set real secrets and ALLOWED_ORIGINS
# then:
docker compose up --build
```

## Verification
- OpenAPI parity: PASS — 114 Express routes documented.
- Frontend/backend/OpenAPI reference check: PASS.
- JavaScript syntax checks: PASS for modified files.
- Full integration suite requires installed npm dependencies and PostgreSQL/Redis/EMQX; the current build environment did not contain those dependencies, so no false live-test claim is made.

See `PHASE30.md` through `PHASE36-FINAL.md` for the final implementation and launch boundary.
