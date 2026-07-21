# Hallazgos: catálogo maestro y sync Toast ↔ Shopify

> Revisión del **SWR Product Catalog v12 (2026-07-19)** de Ruben (`.xlsx` + `.html`, raíz del proyecto) cruzada con la conexión viva a la API de Toast (verificada 2026-07-21). Este documento define el diseño del sync basado en ese trabajo.

## 1. Qué construyó Ruben (y por qué es oro)

Un workbook de reconciliación **v12** — lleva 12 iteraciones haciéndolo a mano — generado desde exports del mismo día (Toast `retail-items` CSV + Shopify `products_export` CSV), con 8 hojas: READ ME, Toast Export (888×104 col), Shopify Export (264×75 col), **Combined** (una fila por producto, ambos canales lado a lado), Suppliers, Needs-Supplier, Shopify-Only y **Flags** (su propia auditoría de calidad de datos).

Sus números (2026-07-19):

| Métrica | Valor |
|---|---|
| Productos totales | **945** |
| Items Toast (retail export) | **888** |
| Productos Shopify | 203 (**146 vinculados a Toast · 57 solo-online**) |
| Toast sin presencia en Shopify | 742 *(esperado — General Store es solo físico)* |
| Proveedores | 110 · **29 items sin proveedor** |
| Items Toast **sin barcode** | **49** |
| Nombres duplicados | 44 |

Sus reglas explícitas en el READ ME (que adoptamos): *"THIS IS A PRODUCT CATALOG, NOT AN INVENTORY COUNT"* · *"Toast remains the master of record"* · columnas doradas = datos financieros (costo, márgenes, ventas 7/30/90d) que **no salen del negocio** · refresh mensual manual (próximo: 2026-08-19).

## 2. Las llaves del sync (confirmadas por su Combined)

```
Toast GUID  ←— llave Toast (la que ya usa nuestro master)
Barcode     ←— llave de CRUCE entre canales (así vinculó los 146)
Handle + Variant ←— llave Shopify
```

La hoja **Combined** es exactamente nuestra futura tabla de mapeo: `Channel · Product Name · POS Name · Supplier · Category · Size · Price · Barcode · Toast GUID · Toast visibility · Shopify Handle · Shopify Status · variants · Link me`. **La importamos una vez como semilla del mapeo y de ahí en adelante el sistema la mantiene sola.**

## 3. Los tres números que no cuadran (y por qué)

| Fuente | Items | Fecha |
|---|---|---|
| Nuestro seed (`catalog_v1.json`) | 938 | export 2026-07-14 |
| Retail export de Ruben | 888 | 2026-07-19 |
| **API Menus V2 (en vivo)** | **923** | 2026-07-21 |

Hipótesis a validar en el build: (a) el retail export excluye items que el API sí devuelve (no-retail, ocultos, servicios); (b) hubo archivados entre el 14 y el 19; (c) la columna "Toast visibility" del Combined explica parte (items solo-POS vs online). **El job de sync debe producir el informe de conciliación de los 3 conteos — primer entregable del viernes.**

## 4. Diseño del sync (derivado de su workbook)

Lo que Ruben hace a mano cada mes, el sistema lo hará continuo:

1. **Toast → master** (ya verificado): Menus V2 por GUID, poll de `/metadata`; upsert de productos con visibilidad y precios. *Su export mensual muere.*
2. **Shopify → master** (pendiente credencial): Admin GraphQL `products/variants` con barcode/SKU; cruce automático por **barcode** contra Toast; lo no cruzable cae a una cola "Link me" (igual que su columna) para decisión humana en la app.
3. **Ventas → ledger**: Toast Orders (webhook + poll) y Shopify `orders/create` descuentan el mismo master.
4. **Flags automáticos**: replicar su hoja Flags como vista permanente — sin barcode, nombres duplicados, POS >24 chars, sin proveedor, drift entre canales de precio. *Él ya demostró que valora este reporte; nosotros lo hacemos diario y accionable.*
5. **Master → Shopify** (fase de escritura, tras validación): publicar existencias (`inventorySetQuantities`).

## 5. Decisiones que necesita tomar Ruben (llevarlas al viernes)

1. **49 items sin barcode**: ¿asignamos barcodes (recomendado) o mapeo manual permanente?
2. **57 productos solo-Shopify** (cortes /lb, cajas): ¿se crean en Toast, o se declaran "solo online" en el master? (Precio por peso = complejidad aparte.)
3. **29 items sin proveedor**: su hoja Needs-Supplier lista los GUIDs — 15 min de su tiempo los cierra.
4. Confirmar que el master del app absorbe el rol del workbook (v12 = **última versión manual**; v13 la genera el sistema).

## 6. Sensibilidad

El xlsx contiene costos, márgenes y ventas (columnas doradas). **No subir a Notion ni al repo público.** En el app: visibles solo para rol admin vía RLS. Los archivos v12 quedan fuera de git (raíz del workspace, no del repo).

## 7. Próximos pasos técnicos

- [ ] Script `scripts/import-catalog-v12.mjs`: Combined → tabla `channel_links` (toast_guid, barcode, shopify_handle, estado) como semilla.
- [ ] Job de sync catálogo Toast (Menus V2) + informe de conciliación 938/888/923.
- [ ] Al llegar credencial Shopify válida: lectura de productos + cruce por barcode → métrica de cobertura vs sus 146.
- [ ] Vista "Flags" en el app (retoma su auditoría, automatizada).
