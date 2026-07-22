# Arquitectura y modelo de datos

Referencia para cualquier cambio que toque esquema, RLS o integraciones. Ante la duda, consulta este documento ANTES de escribir la migración.

## Modelo de datos (Supabase Postgres)

| Tabla | Propósito |
|---|---|
| `products` | Catálogo maestro. **Llave de negocio: `toast_guid`**. Campos de Toast (nombre, precio) + campos propios (proveedor, barcode, categoría). `archived_at` = borrado suave. |
| `profiles` | Perfil por usuario de Auth: `role` (`admin` / `staff` / `vendor`), `is_master` (tier admin superior), estado activo. |
| `vendors` | Directorio de proveedores. |
| `vendor_charges` | Cargos / cuentas por pagar a proveedores (visto en el portal del proveedor). |
| `inventory_movements` | **Ledger**: cada cambio de existencias es una fila (receiving, removal, ajuste, venta) con atribución (quién, cuándo, por qué). Nunca se edita ni borra el historial. |
| `inventory_levels` | Total corriente por producto, mantenido por **trigger** desde `inventory_movements`. No se escribe a mano. |
| `receiving_sessions` / `receiving_lines` | Sesiones de recepción de mercancía; las líneas se sincronizan por Realtime para edición colaborativa (con guarda de input activo para no pisar lo que alguien teclea). |
| `removals` | Retiros / mermas (generan movimientos en el ledger). |
| `market_days` / `market_day_items` / `market_day_staff` | Días de mercado (pop-ups): jornada, items llevados y personal asignado. |
| `documents` | Metadatos de documentos en Supabase Storage (facturas de proveedor, etc.). |
| `product_next_expiry` | Vista/apoyo de próxima expiración por producto. |

Migraciones en `supabase/migrations/` (prefijo `AAAAMMDD_`), aplicadas manualmente vía Supabase MCP o SQL Editor — el repo es el registro, no el ejecutor.

## Roles y RLS

- **La seguridad vive en la base de datos**: los permisos son políticas RLS de Postgres, no chequeos del cliente. Cualquier tabla nueva DEBE nacer con RLS habilitado y políticas explícitas.
- `admin`: gestión completa (productos, inventario, vendors, pagos, usuarios staff/vendor).
- `is_master` (sigue siendo `role = 'admin'`, así los gates existentes funcionan): exclusividad para gestionar cuentas **admin** (crear admins, dar/quitar rol admin, activar/desactivar admins, alternar `is_master`).
- `staff`: operación diaria (receiving, counts, removals) sin administración.
- `vendor`: solo su propio portal (sus cargos, pagos y documentos).
- Datos financieros sensibles (costos, márgenes): visibles solo para `admin` vía RLS.

## Autenticación de integraciones

- **Toast**: OAuth2 client-credentials — `POST /authentication/v1/authentication/login` con `{clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT"}` → JWT válido 1 día (cachear; re-pedir devuelve el mismo). Toda llamada lleva `Authorization: Bearer` + `Toast-Restaurant-External-ID: <guid>`. Catálogo por **Menus V2** (poll de `/metadata`, re-fetch solo si cambió `lastUpdated`; 1 req/s). Orders (ingesta de ventas) planeado: webhook + poll de reconciliación. Detalle: `docs/INTEGRACIONES.md`.
- **Shopify**: Admin GraphQL API. Auth por **client-credentials grant** (`POST /admin/oauth/access_token` con client_id/secret) → token de **24 h** minteado al vuelo; fallback a `SHOPIFY_ADMIN_ACCESS_TOKEN` fijo de custom app. Versión de API en `SHOPIFY_API_VERSION`. Skills `shopify-admin` y `shopify-dev` en `.claude/skills/`.
- Fase actual de integraciones: **solo lectura** ("integraciones con red de seguridad"); escrituras (publicar stock a Shopify, 86'ing en Toast) solo tras validación con el administrador.

## Invariantes (no negociables)

1. **`toast_guid` es la llave** del producto en todo el sistema; el cruce entre canales es por **barcode**.
2. **Nombre y precio los posee el sync de Toast** — la app no los edita a mano; los campos propios del maestro (proveedor, categoría, barcode) sí.
3. **`archived_at` es borrado suave** — nunca `DELETE` de productos: tienen historial en el ledger.
4. **El inventario es un ledger** — nunca actualizar `inventory_levels` directamente; siempre insertar en `inventory_movements`.
5. **Nunca exponer llaves de servicio al cliente** — `SUPABASE_SERVICE_ROLE_KEY` solo en servidor (`src/lib/supabase/admin.ts` lanza error si se importa client-side; mantener esa guarda).
6. **RLS obligatorio** en toda tabla nueva; los roles se chequean en Postgres.
7. **Secretos y datos del negocio fuera del repo** — catálogos, costos y márgenes nunca se comitean.
