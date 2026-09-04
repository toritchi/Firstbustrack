# Phase 26 — Advanced Dispatch & Control Center

Implemented on top of Phase 25.

## Added
- Dispatcher-first Control Center as the default admin workspace.
- Hierarchical filters: Wilaya → City → Operator → Route → Direction → Bus.
- Real-time fleet map canvas plotting only buses with real backend GPS coordinates.
- Live WebSocket telemetry overlay with reconnect/status indicator.
- Fleet cards with status, line, direction, speed, occupancy/capacity and GPS age.
- Selected-bus operational detail panel.
- GPS health fields: last GPS age, accuracy, heading and odometer.
- ETA and latest telemetry inspection using existing backend endpoints.
- Trip controls using the existing transition API: start, at stop, terminal, confirm return, end.
- Direction workflow remains manual; no automatic direction switching was added.
- Emergency/out-of-service/GPS-error visual emphasis.
- Fixed ticket-offer datetime form serialization to ISO timestamps.

## API discipline
No new REST endpoints were added. The phase reuses the existing documented backend APIs.

## Verification
- `node --check frontend/app/admin/page.js` PASS.
- Full Next.js build was not executed because dependency installation has previously timed out in this environment.
- Live database/Redis/MQTT runtime was not claimed as tested here.

## Known limitation
The dispatcher map is a dependency-free live GPS plotting canvas rather than a tile-based Leaflet/OSM map. It never fabricates coordinates. A production tile-map integration can be added once the deployment dependency strategy is confirmed.
