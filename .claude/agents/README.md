# Agentes del proyecto

Subagentes especializados por dominio. Cada uno concentra las invariantes y lecciones de su área — se invocan solos cuando la tarea encaja con su descripción, o por nombre.

## Roster

| Agente | Dominio | Cuándo |
|---|---|---|
| `inventario` | Ledger, movimientos, niveles, receiving, traslados a piso, market days | Cualquier feature que cree/mueva/corrija existencias |
| `integraciones` | Toast + Shopify: auth, sync, webhooks, límites | Todo trabajo contra APIs externas o scripts de sync |
| `proveedores` | Vendors, cargos/pagos, portal, documentos, objetivo 2 | Features de vendors/charges/portal |
| `revisor-db` | Esquema, RLS, migraciones (solo análisis) | ANTES de toda migración o cambio a queries de datos |
| `revisor-ux` | Doctrina de UI/UX (solo análisis) | ANTES de construir pantallas y antes de mergear UI |

## Futuro (Mes 3 — objetivos 4–6)

Cuando se construyan los agentes de IA de la app (WhatsApp cliente, asistente admin, Meta Ads) se agregará un especialista `agentes-ia` (Claude API, tools de solo lectura sobre Supabase, límites de tokens). No crear antes de tiempo.

## Convención

Los constructores (`inventario`, `integraciones`, `proveedores`) heredan todas las herramientas; los revisores (`revisor-db`, `revisor-ux`) son de solo lectura. Todos respetan `.claude/rules/` y la disciplina de changelog.

Los skills de Shopify (`shopify-admin`, `shopify-dev`) viven en `.claude/skills/` y cargan solos al trabajar con la Admin API.
