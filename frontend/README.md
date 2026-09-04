# Algeria Bus Platform — Phase 21

Complete passenger-facing Next.js UI wired to the existing Phase 20 REST APIs.

Implemented screens: home/live buses, routes and route details, stops, bus details, journey planning, passenger OTP account/profile/phones/preferences, ticket offers/tickets/payments, service alerts, and live WebSocket update handling.

The map remains an OpenStreetMap integration point because the backend does not provide map tiles/geometry. Real external payment/SMS providers are also not connected in the backend yet.

Run with Node.js after installing dependencies:

```bash
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` if the API is not on `http://localhost:3000`.


## Phase 22
Passenger UX hardening is included: responsive navigation, OSM map embed, live WebSocket refresh, secure QR rendering after ticket issuance, refunds, notifications, additional-phone verification and PWA manifest.
