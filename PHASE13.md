# Phase 13 — Operations Dashboard & Reporting

Implemented on top of Phase 12.

## APIs
- GET /api/v1/admin/dashboard/overview
- GET /api/v1/admin/dashboard/operations
- GET /api/v1/admin/reports/trips?from=YYYY-MM-DD&to=YYYY-MM-DD
- GET /api/v1/admin/reports/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD
- GET /api/v1/admin/reports/ticketing?from=YYYY-MM-DD&to=YYYY-MM-DD
- GET /api/v1/admin/reports/notifications?from=YYYY-MM-DD&to=YYYY-MM-DD

## Access
Super Admin and Data/Reporting Admin can access all reports. Operations Admin can access operational/trip/occupancy reporting. Ticketing Admin can access ticketing reporting. Notification Admin can access notification reporting.

## Notes
- Date ranges default to the last 7 days through today.
- Invalid date ranges are rejected.
- Queries use aggregate SQL and indexes added in migration 012.
- No fake KPI values are generated.
- PostgreSQL integration tests were not run because dependencies/database services are not installed/running in the build environment.
