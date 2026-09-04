# Phase 27 — Route Geometry & Stop-by-Stop Dispatch Progress

Implemented on top of Phase 26.

## Added
- Real route visualization from the selected direction's ordered stop coordinates.
- Route polyline rendered from backend stop data without inventing coordinates.
- Stop markers with names/tooltips.
- Selected bus nearest-stop calculation using Haversine distance.
- Stop sequence and percentage progress indicator in dispatch detail.
- Distance from current bus GPS position to nearest route stop.
- Route/stop data refresh when direction changes.
- Existing live GPS/WebSocket behavior preserved.
- Existing trip controls and direction-change workflow preserved.
- Fixed ticket offer datetime conversion retained from Phase 26.

## API reuse
No new REST endpoints were added. Existing direction-stop endpoint is used:
`GET /api/v1/admin/directions/:directionId/stops`

## Verification
- `node --check frontend/app/admin/page.js` PASS
- Full Next.js build/runtime not executed because dependency installation has historically timed out in the environment.
- Live database/Redis/MQTT integration not claimed as executed.
