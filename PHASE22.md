# Phase 22 — Passenger UX hardening

## Delivered
- Responsive passenger navigation and visual hierarchy.
- Real OpenStreetMap embed on the home map; no fake map data.
- Live bus refresh with WebSocket updates and last-updated indicator.
- Ticket purchase flow separated into payment creation and ticket issuance after payment becomes PAID.
- One-time QR token from ticket issuance is rendered with `qrcode.react`; ticket-list API remains token-free.
- Passenger refund request UI with amount and reason validation handled by backend.
- Passenger account sign-in, profile editing, logout, notification preferences and additional phone verification UI.
- Dedicated passenger notifications page using the real notification endpoint.
- PWA manifest added.
- Loading, empty, success and error states improved across the passenger wallet/account experience.

## Security / correctness notes
- No QR token is fabricated or recovered from the ticket list.
- No payment is falsely marked PAID by the frontend.
- Existing backend contracts were used; no new backend endpoints were invented.
- The browser cannot bypass backend payment/ticket validation.

## Verification
- `node --check` passes for all frontend JavaScript files.
- A full Next.js production build was not claimed because dependency installation was not available/reliably completing in the execution environment.
