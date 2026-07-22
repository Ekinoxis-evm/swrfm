# Propuesta: Traslado a piso (el "removal log" de Ruben, reimaginado)

- **Fecha:** 2026-07-22
- **Propone:** William (análisis del handoff de Ruben: `swarm_buildapp/docs/removal handoff/`)
- **Objetivo del plan:** 1 · Inventario maestro con roles
- **Estado:** Borrador → para revisión con Ruben el viernes

## El problema

El flujo más usado de la operación diaria es mover producto **del almacenamiento (cooler) al piso de venta**. Hoy vive en el `removal.html` legado: funciona y el equipo lo domina, pero tiene PINs en el código, no sincroniza listas entre iPads, y su inventario es una copia paralela que no habla con Toast ni con el master.

**Concepto correcto (definición de William):** el "removal" NO es una venta ni una merma — es un **traslado interno** storage → piso. No cambia el total en existencia; cambia dónde está. La venta (Toast) descuenta después, del piso.

## Qué preservamos del diseño de Ruben (probado en operación real)

1. **Dos contadores por producto: cajas + unidades sueltas**, con "romper caja" (case → units). Es como el equipo piensa.
2. **Ledger reversible**: cada traslado es un movimiento que se puede editar/anular y el saldo se recalcula — nunca contadores mutados a mano.
3. **Firma del manager**: el cierre del día donde un manager revisa y firma los traslados. Ritual de control que Ruben diseñó — se conserva, ahora con cuentas reales en vez de PINs.
4. Tiempo real entre dispositivos (ya lo tenemos con Supabase Realtime) y visión por proveedor.

## La propuesta — flujo "nivel Steve Jobs" (3 gestos)

**Pantalla del empleado (móvil/iPad, ruta `/floor` o botón gigante en su inicio):**

1. **📷 ESCANEAR** — pantalla-cámara que lee el barcode (API `BarcodeDetector` del navegador; fallback: buscar por nombre/SKU). *Un gesto.*
2. **La tarjeta del producto aparece sola**: nombre grande, **proveedor automático** (viene del master, no se pregunta), existencia en storage (X cajas · Y unidades). El empleado solo toca: **stepper de cantidad** + toggle **caja/unidad**. *Un gesto.*
3. **✓ TRASLADAR** — botón grande. Movimiento registrado con su cuenta (sesión real: quién, qué, cuándo), saldos actualizados en vivo en todos los dispositivos. *Un gesto.*

Sin menús, sin dropdowns de vendor, sin teclear nombres. El barcode trae todo. (Sinergia directa: los **49 productos sin barcode** se corrigen desde la edición de productos que ya está en producción — cada barcode que Ruben agregue hace este flujo más completo.)

**Pantalla del manager:** cola del día de traslados → revisar → **firmar todos** (o uno a uno), editar/anular con motivo. Reemplaza el sign-off del legado, con auditoría nativa del ledger.

## Las tres funciones, separadas y claras (taxonomía de movimientos)

| Función | Movimiento | Quién | Efecto |
|---|---|---|---|
| **Agregar inventario** | `receiving` (ya existe) | Staff/Admin | + storage |
| **Trasladar a piso** | `floor_transfer` (NUEVO — esta propuesta) | Empleado, firma manager | storage → piso (total igual) |
| **Vender** | `sale` (Toast/Shopify — obj. integraciones) | Automático | − piso |
| **Editar/ajustar** | `adjustment` / conteo físico | Admin/Manager | corrige cualquier saldo, con motivo |
| **Merma/retiro definitivo** | `removal` (ya existe, se re-etiqueta "Merma") | Manager | − total, con motivo |

## Cambios técnicos (mínimos, sobre lo que ya existe)

1. **Ubicación en el ledger**: los movimientos ganan dimensión `location` (`storage` | `floor`); saldos derivados por producto y ubicación (vista/trigger sobre el ledger actual — no una copia paralela).
2. **Cajas/unidades**: `products` gana `units_per_case` (del master de Ruben); el movimiento registra `remove_by: case|unit` como el legado.
3. **Página `/floor`** (empleado) + cola de firma en la página de removals actual (manager).
4. Migración de datos legado: el histórico del `swr.db` se puede importar como movimientos históricos (fase 2, opcional).

## Cómo se ve el éxito

- Un empleado nuevo traslada producto correctamente en su primer intento, sin capacitación (escanear → cantidad → listo).
- El manager firma el día en menos de 1 minuto.
- Piso y storage cuadran contra el conteo físico; el legado `removal.html` se apaga.

## Preguntas para Ruben (viernes)

1. ¿Los 4 proveedores del removal legado siguen siendo los únicos con flujo de cooler, o se abre a todo el catálogo?
2. ¿`units_per_case` está en su xlsx v12 por producto? (El legado lo tenía por item.)
3. ¿La firma del manager debe seguir siendo diaria-por-lote, o por traslado?
4. ¿Necesitamos offline real (cooler sin señal), o la señal del local alcanza?

## Decisión

*(Se llena tras la revisión del viernes.)*
