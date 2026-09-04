# Phase 28 — Interactive OpenStreetMap / Leaflet Dispatch Map

## Delivered
- Replaced the Phase 27 CSS-only dispatch map with a real interactive Leaflet map.
- OpenStreetMap raster tiles with attribution.
- Real GPS bus markers only; no fabricated coordinates.
- Selected bus tracking and map auto-pan.
- Auto-fit to live fleet on initial load.
- Route polyline from the selected direction's actual stop coordinates.
- Stop markers/tooltips with sequence and name.
- Bus tooltips and click-to-select behavior.
- Emergency / out-of-service / GPS-error marker styling.
- Responsive map container.

## Dependency strategy
Leaflet is loaded from the public unpkg CDN at runtime rather than added to npm dependencies. This avoids changing the existing package lock/dependency installation path in the current environment.

## Verification
- `node --check frontend/app/admin/page.js` PASS.
- Full Next.js build not executed because npm dependency installation has previously timed out in the environment.
- Live PostgreSQL/Redis/MQTT integration not claimed as tested.

## Contract
No backend REST endpoint was added. Existing Phase 27 APIs and WebSocket behavior are reused.
