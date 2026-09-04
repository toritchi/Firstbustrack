# Phase 30 — Operations Intelligence & Automatic Alerts

Added a persistent operational-alert subsystem. Every 30 seconds the API evaluates active buses for GPS loss/stale telemetry, emergency, out-of-service, over-capacity and prolonged-stop conditions. Alerts are deduplicated per bus/type until resolved.

Admin endpoints: list, acknowledge, resolve. RBAC: Super Admin, Operations Admin and Data/Reporting Admin.
