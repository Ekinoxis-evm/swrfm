# Changelog

Notable changes to the SWRFM Master inventory app. Mirrors the 📝 Changelog in Notion.
Newest first.

## 2026-07-23 — Toast sales live, transfers, UX overhaul

### Added
- **Toast sales → floor drawdown (live).** Sales flow from Toast into the master and draw
  down floor stock in real time via a signed webhook (`/api/webhooks/toast-orders`,
  `order_updated`), with a daily reconciliation poll as backstop (`/api/cron/toast-sales`).
  Reconcile is idempotent per Toast selection GUID and concurrency-safe (atomic
  `apply_toast_sales` function); voids/refunds return stock. Sold-item GUIDs map 1:1 to
  `products.toast_guid`. First live capture: 309 orders → 1,335 movements → ~1,802 units.
- **Stock transfers, storage ↔ floor.** The old "removal" reimagined as an internal transfer
  that doesn't change the total, only its location. Employee requests via a 4-step wizard
  (Direction → Vendor → Product → Amount); a manager approves. Bidirectional, real-time.
- **Nightly removal report email** (Resend, from `hola@ekinoxis.xyz`) with per-day retry
  recovery; recipients managed by the master admin from **/users** (no env var).
- **Receiving ↔ vendor-invoice chain** surfaced: the vendor's charge (submitted by the
  provider) shown against the delivery, with invoiced-vs-received reconciliation.
- **Channel sync** on the dashboard: Toast catalog freshness, Shopify linked %, data gaps.
- **Toast sales today** panel on the dashboard: units sold, last sale, top sellers.
- **Branding:** app renamed **SWRFM Master**; farmers-market logo as favicon and in-app.

### Changed
- **Bi-thermal design system** (cold = storage, warm = floor): cool palette, reusable
  sortable/filterable `DataTable`, typographic status chips, and wizard chrome. Inventory,
  Transfers, Removals, and Dashboard reskinned to it.
- **Nested navigation:** Inventory is a hub with Master · Transfers · Receiving sub-tabs.
- **Removal log** ported faithfully from Ruben's legacy `removal.html` onto the Supabase
  ledger — cases/units, reversible ledger (edit/void compensate, never rewrite history),
  manager sign-off, America/New_York operating day, atomic writes.

### Fixed
- Removal-log day boundary was computed in UTC (cut the day early in Florida).
- Removal insert + ledger movement were two calls; now one transaction.
- RLS let `staff` sign removals; sign/edit/void now require `admin` in Postgres.
- `cooler_relevant` flag pointed at the wrong products vs. the cooler vendors.
- Vercel build failed on a sub-daily cron schedule (Hobby allows daily only) — set to daily.

### Investigated / documented
- **Toast Purchasing & Receiving / xtraCHEF have no public API** — the standard Toast API
  is sales/catalog only. "Feed, don't rebuild" for purchasing must go via xtraCHEF export or
  a partner feed. See `docs/INTEGRACIONES.md`.

### Migrations (applied)
`20260722_removal_handoff.sql`, `20260722_removal_report_log.sql`,
`20260722_removal_report_recipients.sql`, `20260723_floor_transfers.sql`,
`20260723_toast_sales.sql`, `20260723_apply_toast_sales.sql`.
