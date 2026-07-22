# Removal log — alineación con el handoff de Ruben

Mapa entre `swarm_buildapp/docs/removal handoff/SWR_Removal_Integration_Handoff.md`
(el contrato del `removal.html` + `server.js` legado) y lo que hoy corre en esta app.

Migración: `supabase/migrations/20260722_removal_handoff.sql`.
Pantalla: `src/app/(app)/removals/` · lógica de día operativo: `src/lib/market-day.ts`.

## Contrato de API (§3) → funciones de Postgres

El legado exponía endpoints HTTP en un Node local. Aquí son funciones `SECURITY DEFINER`
sobre Supabase: una sola transacción por operación y el rol validado **en la base**, no
en el cliente.

| Endpoint legado | Equivalente | Notas |
|---|---|---|
| `POST /removal/add` | `log_removal(guid, qty, remove_by, weight, note)` | Escribe el retiro **y** el movimiento del ledger juntos. Antes eran dos inserts sueltos que podían quedar a medias. |
| `POST /removal/sign` | `sign_removal(id)` | Solo `admin`. Registra `signed_by` + `signed_at`. |
| `POST /removal/sign-all` | `sign_all_removals(date)` | Firma el día operativo completo; el legado lo simulaba llamando `/removal/sign` uno por uno. |
| `POST /removal/update` | `update_removal(id, qty, …)` | Corrige la cantidad y **compensa la diferencia** con un movimiento nuevo. |
| `POST /removal/delete` | `void_removal(id, reason)` | El legado borraba la fila. Aquí se marca anulada y se devuelve el stock — el historial no se reescribe. |
| `GET /removal/list?date=` | `select … where local_date = …` | Vía PostgREST, con RLS. |
| `POST /save` · `GET /load` | — | No aplica: el blob JSON se reemplaza por tablas reales. |
| `GET /ws` | Supabase Realtime sobre `removals` | Más un *poll* de 60 s de red de seguridad, igual que el legado. |
| `POST /send-email` | Cron `/api/cron/removal-report` | Reporte nocturno vía Resend. Ver abajo. |

## Modelo de datos (§4)

**§4a RemovalRecord.** `removals` cubre todos los campos: `remove_by` (`case`/`unit`),
`vendor_name`, `signed_by`/`signed_at`, `edited_by`/`edited_at`, y además
`voided_by`/`voided_at`/`void_reason` que el legado no tenía.

`local_date` guarda el **día operativo en America/New_York**. Importa: el código anterior
calculaba "hoy" con `new Date().setHours(0,0,0,0)` sobre un servidor de Vercel en UTC, así
que a partir de las 20:00 hora de Florida el log cambiaba de día antes de tiempo.

**§4b Inventario de dos contadores.** El legado llevaba `cases` y `units` sueltas en un
JSON paralelo. Aquí son dimensiones del **mismo ledger** (invariante 4 de
`.claude/rules/arquitectura.md`), no una copia:

- `inventory_movements` gana `cases_delta` y `units_delta`; `delta` sigue siendo el total.
- Un trigger rellena `units_delta = delta` para quien solo manda `delta` (receiving,
  conteos, ventas), así siempre vale `on_hand = cases × units_per_case + units`.
- `inventory_levels` gana `cases_on_hand` / `units_on_hand`.
- "Romper caja" es `break_case(guid, n)`: `−1` caja, `+units_per_case` unidades, total sin cambio.

**El ledger reversible** — lo que el handoff señala como "lo más fácil de equivocar" — se
cumple por construcción: nada muta contadores a mano, y anular o editar inserta el
movimiento inverso. Verificado de extremo a extremo contra la base: registrar 2 cajas
(12/caja) → −24; editar a 1 → −12; anular → 0.

**§4c Datos locales del dispositivo.** Los `localStorage` del legado (productos, vendors y
empleados por iPad) **desaparecen**: el catálogo es `products` en Postgres y los empleados
son cuentas reales. Esto resuelve el "main thing to decide during integration" del handoff
— las listas ya sincronizan entre dispositivos por definición.

**§4d Product master.** Ya no se hornea en el HTML: viene del sync de Toast.

## Proveedores y managers (§5)

Las pestañas de la pantalla son los 4 proveedores de cooler del handoff (Florida Fresh
Meat, US Wellness Meats, Lake Meadow Naturals LLC, Pennsylvania Farms) más "Other".

**Hallazgo:** el flag `cooler_relevant` estaba marcado en 111 productos que **no** son de
esos proveedores (Guudy, Kokolate, Brooklyn Biltong…), mientras que de los 148 productos de
los 4 proveedores del cooler solo 3 lo tenían. El selector de retiros mostraba el catálogo
equivocado. La migración marca los 148 correctos **sin desmarcar** los otros — la limpieza
del resto se decide con Ruben.

## Seguridad (§6) — los puntos que el handoff pedía resolver

| Punto del handoff | Estado |
|---|---|
| 1. PINs de manager en el JavaScript del cliente | **Resuelto.** Cuentas reales; firmar/editar/anular exigen `role = 'admin'` dentro de Postgres. `removals` no tiene policy de `UPDATE` ni `DELETE`: un intento directo desde el cliente afecta 0 filas (verificado). |
| 2. API sin autenticación | **Resuelto.** Todo pasa por Supabase Auth + RLS. Las funciones se revocaron a `anon`; solo `authenticated`. |
| 3. Contraseña de email en el servidor | No aplica todavía (sin envío de correo). |
| 4. `/save` acepta clave/valor arbitrarios | **Resuelto** — ese almacén ya no existe. |
| 5. Ediciones de listas locales al dispositivo | **Resuelto** (ver §4c). |

## Reporte nocturno por correo

El legado mandaba el resumen del día a las 11:55 PM desde el Mac Mini con Nodemailer +
Gmail. Aquí es un **Vercel Cron** que llama a `/api/cron/removal-report` y envía con
**Resend** desde `hola@ekinoxis.xyz` (dominio verificado).

- **Horario:** `55 3 * * *` UTC (`vercel.json`). En horario de verano son las 11:55 PM de
  Florida, igual que el legado; en invierno, las 10:55 PM. Vercel solo programa en UTC, y en
  ambos casos cae después del cierre y dentro del mismo día operativo.
- **Sin duplicados y con recuperación tardía:** `removal_report_log` registra la fecha
  **solo** si Resend aceptó el mensaje. Cada pasada envía el día de hoy y, si el de ayer
  nunca salió, lo recupera marcado como `[LATE — auto-recovered]`. Es la misma garantía que
  el legado añadió el 7 de julio de 2026 tras perder reportes por caídas del Mac Mini.
- **Reenvío manual:** `GET /api/cron/removal-report?date=YYYY-MM-DD` con el mismo bearer.
  Ignora el registro a propósito — se pide explícitamente.
- **Autenticación:** `Authorization: Bearer $CRON_SECRET`, que es como Vercel invoca sus
  crons. `/api/cron/*` está exento del middleware de sesión (si no, lo redirigía al login).

Variables (ver `.env.example`): `RESEND_API_KEY`, `REMOVAL_REPORT_FROM`,
`REMOVAL_REPORT_TO` (coma-separado; **vacío = no envía nada**), `CRON_SECRET`.

Probado de extremo a extremo contra el endpoint real: sin bearer → 401 · reenvío del
2026-07-15 → entregado por Resend a los dos destinatarios · pasada automática → envía hoy y
recupera ayer · segunda pasada → `already_sent`, sin duplicar.

## Pendiente — decisiones y trabajo que no entra aquí

1. **`units_per_case` está vacío en los 924 productos.** Es el bloqueo real para operar
   por caja: hasta llenarlo, la pantalla deshabilita el modo "case" y solo deja retirar por
   unidad. Ya es editable por admin desde la ficha del producto (`/products/<guid>`).
   - La columna `receiving unit quantities` del catálogo v12 **está vacía en las 888 filas**
     del export de Toast, así que no sirve de fuente.
   - `swarm_buildapp/swr_data.json` sí trae 62 valores reales (Cow Plain Yogurt 12, Butter
     50, Duck Eggs 15, Cheddar 20…), pero solo **6 casan por nombre** con el catálogo de
     Toast: el legado usa nombres cortos. No se auto-poblaron — adivinar aquí corrompe la
     matemática de inventario. La fuente autoritativa es `swr_inventory.items[].perCase` del
     `swr_data.json` **de producción** (Mac Mini), que no está en este snapshot.
2. **Cola offline** (`rl_sync_queue` del legado): no portada. Depende de la pregunta 4 de
   `proposals/2026-07-22-traslado-a-piso.md` — si el cooler tiene señal, no hace falta.
3. **Alerta de stock bajo**: `low_stock_cases` ya existe y es editable, pero ninguna
   pantalla la usa todavía.
4. **Migración del histórico** del `swr.db` legado: fase 2, opcional (§7 del handoff).

## Relación con la propuesta de "traslado a piso"

`proposals/2026-07-22-traslado-a-piso.md` replantea el removal como traslado
storage → piso, con dimensión `location` y escaneo de barcode. Esto **no** lo implementa:
es el puerto fiel del legado, para poder apagar `removal.html` sin esperar decisiones. La
propuesta se construye encima (el ledger con dimensiones caja/unidad ya es la mitad del
camino) cuando Ruben conteste sus 4 preguntas.
