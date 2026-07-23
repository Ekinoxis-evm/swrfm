# Integraciones Toast + Shopify — plan de conexión

> Fase inicial **solo lectura** (doctrina: "integraciones con red de seguridad"). Escrituras (p. ej. publicar existencias a Shopify, 86'ing en Toast) solo tras validar los cruces con el administrador.
> Investigación: 2026-07-21, docs oficiales (doc.toasttab.com · shopify.dev).

## Credenciales — dónde viven

**NUNCA en el código, en git, en Notion ni en chat.** Solo en:
1. `.env.local` (desarrollo local — ya está en `.gitignore`)
2. Vercel → Project → Environment Variables (producción)

```bash
# Toast (standard API access — solo lectura)
TOAST_API_HOST=https://ws-api.toasttab.com
TOAST_CLIENT_ID=
TOAST_CLIENT_SECRET=
TOAST_RESTAURANT_GUID=          # GUID de la ubicación (llega por correo al crear las credenciales)

# Shopify (custom app de la tienda — Admin API)
SHOPIFY_STORE_DOMAIN=           # xxxx.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=     # shpat_... (token del custom app)
SHOPIFY_API_VERSION=2026-01
```

## Toast — lo que averiguamos (resumen ejecutivo)

**Auth:** OAuth2 client-credentials. `POST /authentication/v1/authentication/login` con `{clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT"}` → JWT válido **1 día** (cachear globalmente; pedirlo de nuevo devuelve el mismo token). Cada llamada lleva `Authorization: Bearer` + `Toast-Restaurant-External-ID: <guid>`.

**APIs que usaremos:**
| API | Para qué | Scope | Nota |
|---|---|---|---|
| **Menus V2** (`/menus/v2/menus`, `/metadata`) | Sincronizar catálogo: items con **GUID**, precios, impuestos | `menus:read` | Poll `/metadata` (lastUpdated) y re-fetch solo si cambió. Límite: 1 req/s. **NO usar V3** (solo ordering partners) |
| **Orders** (`/orders/v2/ordersBulk`) | Ingesta de ventas → descuento del ledger | `orders:read` | Consultar por **fecha de modificación** (no businessDate): captura ediciones/voids/refunds. Paginación `pageSize` máx 100 + `Link` headers. 5 req/s; backfill histórico en ventanas de 1 mes |
| **Stock** | (futuro, escritura) marcar agotados en el POS | `stock:read/write` | Toast solo maneja estado in/low/out — nuestro app es el ledger de cantidades |
| **Restaurants** | Timezone y configuración del día de negocio | `restaurants:read` | Necesario para interpretar businessDate |

**Webhooks (la vía principal para ventas):** el acceso estándar SÍ incluye webhooks de **Orders** (payload = el Order completo, evento `order_updated` en cada cambio → dedupe/upsert por order GUID) y de Stock/Menus. Se suscriben en Toast Web (Integrations → Toast API access → Manage credentials → "+ Add webhook"), requieren permiso 8.4 y suscripción RMS Essentials+. Cada suscripción trae un **secret HMAC** — verificar cada mensaje. ⚠️ La credencial ligada a una suscripción es inmutable: crear el credential set definitivo ANTES de suscribir.

**Sin sandbox** para acceso estándar → probar contra el restaurante real, solo lectura. Rate limits: 20 req/s · 10k/15min por ubicación; honrar `Retry-After` en 429.

**Arquitectura de sync:** webhook Orders como primario + poll de reconciliación `ordersBulk` (ventana deslizante por modified-time, cada 1–5 min) + catálogo por `/metadata` horario.

## Toast Purchasing & Receiving + xtraCHEF — discovered 2026-07-23 (roadmap)

> Note: this section is in English — the working language is being switched app-wide (the rest of this doc will follow in the pending English migration).

Toast has a **native purchasing & receiving module** that overlaps what we built in this app (our `receiving_sessions` / `receiving_lines` + `vendor_charges`). Worth a deliberate build-vs-integrate decision before we invest more in our own AP/receiving.

- **Purchasing & Receiving** (Toast Web → Retail → Purchasing): create/manage purchase orders, or **receive by invoice**; up to 500 items per PO/invoice.
- **xtraCHEF by Toast** (acquired 2021, now the inventory/food-cost layer): digitizes vendor invoices and extracts **line-item** detail, automates AP, reconciles vendor statements against captured invoices, and builds par-based order guides you can send to vendors.
- **Caveat:** Toast Retail does **not** currently have automatic invoice capture (with or without xtraCHEF) — capture is via xtraCHEF's own flow.

**API access — investigated 2026-07-23 (conclusive):**

- **The standard Toast public API has NO purchasing / receiving / invoice / AP / xtraCHEF endpoints.** The full public surface is: Analytics, Cash management, Configuration, Credit cards, Device details, Gift cards, Kitchen, Labor, Loyalty, **Menus**, **Orders**, Order-management config, Packaging config, Partners, Restaurant availability, Restaurants, **Stock** (86'ing only), Tender. So the module is **not** reachable via the credentials we have (menus/orders/etc.).
- **Toast Retail → Purchasing & Receiving** (POs, receive-by-invoice) is a **Toast Web UI module** — no public API. Toast Retail also has **no automatic invoice capture**.
- **xtraCHEF** is where line-item invoice capture lives, but its data **egresses outbound**, not via a self-serve inbound REST API: its "Sync" feature pushes coded invoices + Toast sales **into accounting systems** (e.g. QuickBooks Online), plus file/CSV exports. Partner/API integrations are **case-by-case** via `support@xtrachef.com` / Toast's partner ecosystem — not self-serve.

**So "feed, don't rebuild" cannot be a simple API wire-up.** Realistic feed paths, best-first:

1. **xtraCHEF invoice export (CSV) → importer script** (fits our zero-dep `scripts/` pattern): ingest captured line-item invoices into `vendor_charges` (link to `receiving_sessions` by vendor + invoice #) and optionally seed `receiving_lines`. Lets xtraCHEF do the OCR/line-item capture while our master stays the hub.
2. **Partner data feed** from xtraCHEF/Toast (contact `support@xtrachef.com`) — cleaner pipeline if granted; likely gated/paid.
3. **QuickBooks as the hub** — if SWR runs xtraCHEF → QuickBooks Sync, read purchasing/AP from QuickBooks instead.

**Open decision (needs the admin):** does SWR actually use xtraCHEF / Toast Retail Purchasing today? If **yes** → build path 1 (CSV import) and confirm export access. If **no** → adopting xtraCHEF (for automatic invoice OCR) vs. keeping our current vendor-submitted-charge flow is a cost/workflow call before any feed exists.

**Target architecture (master = hub, everything feeds in):** catalog ← Toast Menus V2; sales ← Toast Orders + Shopify; purchasing/AP ← xtraCHEF export (path 1). Surfaced in the dashboard "Channel sync" section as *not connected* until a path is chosen.

Sources: [Toast API overview (full API list)](https://doc.toasttab.com/doc/devguide/apiOverview.html) · [Toast Retail — Generate POs & Receive Inventory](https://support.toasttab.com/en/article/Toast-Retail-Generate-Purchase-Orders-Receive-Inventory) · [xtraCHEF by Toast](https://pos.toasttab.com/products/xtrachef) · [xtraCHEF × QuickBooks](https://xtrachef.com/integration/quickbooks/) · [Toast × xtraCHEF](https://pos.toasttab.com/integrations/xtrachef)

## Sales ingestion — BUILT 2026-07-23 (webhook primary + poll backstop)

Toast sales draw down **floor** stock. Verified: our credentials have `orders:read`; sold-item GUIDs map 1:1 to `products.toast_guid` (200/200 in a 6-day sample).

- **Core:** `src/lib/toast-sales.ts` reconciles orders into the ledger — selling N units posts a −N movement at `location='floor'`, reason `sale_toast`, keyed by Toast **selection GUID**, posting only the *delta* vs. what was already posted. Idempotent; a later void/refund posts the compensating +movement (verified: sale −3, replay 0, void +3, resell −5, edit +3).
- **Webhook (primary, near-real-time):** `POST /api/webhooks/toast-orders`. Toast `order_updated` → verify `Toast-Signature` (HMAC-SHA256 of `body+timestamp`, base64) → fetch the order(s) by GUID → reconcile. Fail-closed: rejects until `TOAST_WEBHOOK_SECRET` is set.
- **Poll (backstop):** `GET /api/cron/toast-sales` (Vercel Cron `*/15`, `Authorization: Bearer $CRON_SECRET`) polls `ordersBulk` by modified time since a watermark, 10-min overlap. **First run sets the watermark to _now_ and posts nothing — no historical backfill.** `?dryRun=1&hours=N` previews without writing.
- **State:** `toast_sale_lines` (net posted per selection), `sync_state` (watermark). RLS: read-only for staff/admin; writes via service key only.

**Setup (Toast Web → create webhook subscription):** category **`order_updated`** (not stock), URL `https://swrfm-demo.vercel.app/api/webhooks/toast-orders`, **enable message signing**, notification email. Then put the generated secret in Vercel as `TOAST_WEBHOOK_SECRET` and set `CRON_SECRET`. Note: sub-daily cron needs Vercel Pro. Floor is only stocked by transfers, so selling without transferring drives floor negative — an intended signal.

## Shopify — plan

Skills instalados en `.claude/skills/` (disponibles para cualquier sesión de Claude Code en este repo, incluida la de Ruben):
- **`shopify-admin`** — Admin GraphQL API con schema 2026-01 y validación de queries/mutations.
- **`shopify-dev`** — búsqueda de documentación oficial.

Uso (solo lectura primero):
1. **Leer productos/variantes** (Admin GraphQL `products`/`productVariants`) y mapear contra el catálogo maestro — clave de cruce: SKU/barcode ↔ `toast_guid`.
2. **Leer niveles de inventario** (`inventoryLevels`) para el reporte de discrepancias entre canales.
3. **Webhook `orders/create`** para descontar ventas en línea del ledger.
4. *(Fase de escritura, tras validación)*: `inventorySetQuantities` para publicar existencias del maestro → tienda.

Credencial esperada: **custom app** de la tienda con token Admin API; scopes mínimos lectura: `read_products`, `read_inventory`, `read_orders` (escritura futura: `write_inventory`).

## Checklist de verificación de credenciales (antes de escribir código)

- [ ] Toast: el credential set incluye scopes `menus:read`, `orders:read`, `restaurants:read` (ideal: `config:read`, `stock:read`). Si falta alguno → crear un set nuevo en Toast Web (los scopes son fijos por credencial).
- [ ] Toast: tenemos el **restaurant GUID** (llegó por correo al crear la credencial).
- [ ] Shopify: el token es de custom app con `read_products`, `read_inventory`, `read_orders`.
- [ ] Variables cargadas en `.env.local` y en Vercel (Production + Preview).
- [ ] Primer smoke test (solo lectura): login Toast + `GET /menus/v2/metadata` · query GraphQL `shop { name }` en Shopify.
