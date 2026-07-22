# SWRFM — Sistema Inteligente de Inventario

## Qué es este proyecto

Inventario maestro para **Southwest Ranches Farmers Market**: una sola fuente de verdad para el catálogo y las existencias a través de los 3 canales de venta (mercado físico en Toast POS, tienda Shopify y pop-ups). Next.js (App Router) + Supabase (Postgres, Auth, RLS, Realtime, Storage), desplegado en Vercel (`ekinoxis-team/swrfm-demo`). Demo: https://swrfm-demo.vercel.app

### Mapa de arquitectura

```
Toast POS (Menus V2, OAuth client-credentials)  ─┐
Shopify Admin GraphQL (client-credentials, 24h) ─┤→ scripts/ sync → Supabase ← app Next.js (Vercel)
                                                 │        (products, ledger)      │
                              catálogo v12 Ruben ┘                                └ Realtime → edición colaborativa
```

- **Rutas** (`src/app/(app)/`): `dashboard`, `inventory`, `products`, `receiving`, `removals`, `market-days`, `vendors` (+ `payments`), `vendor` (portal del proveedor), `charges`, `users`, `account`. Login OTP sin contraseña por defecto en `src/app/login/`.
- **Roles**: `admin` / `staff` / `vendor` en `profiles.role`, más el tier `is_master` (admin que además gestiona cuentas admin). Los permisos viven en RLS de Postgres, no en el cliente.
- **Datos**: `products` (llave `toast_guid`, borrado suave con `archived_at`); el inventario es un **ledger** (`inventory_movements` + `inventory_levels` por trigger). Detalle completo: `.claude/rules/arquitectura.md`.

## Cómo trabajar aquí

### Verificación (NUNCA `npm run build` local — es prohibitivamente lento)

```bash
npx tsc --noEmit          # chequeo de tipos
npx eslint <archivos>     # lint de lo que tocaste
```

El build real lo verifica el **preview de Vercel** al abrir el PR. No despliegues ni ejecutes acciones contra producción/Supabase sin validación previa.

### Scripts (patrón: cero dependencias — fetch nativo + parseo de `.env.local`)

| Script | Qué hace |
|---|---|
| `node scripts/smoke-integrations.mjs` | Smoke test solo-lectura de credenciales Toast + Shopify (no imprime secretos) |
| `node scripts/sync-toast-catalog.mjs <links.json> [--apply]` | Sync catálogo Toast → informe de conciliación; solo escribe con `--apply` |
| `node scripts/bootstrap-masters.mjs` | Crea/asegura las cuentas master admin (idempotente, service key) |
| `node scripts/seed-catalog.mjs <catalog.json>` | Semilla del catálogo desde un export de Toast (fuera del repo) |

### Variables de entorno

Todas documentadas en `.env.example`. Copia a `.env.local` (gitignored) y llena. **Los archivos `.env*` no se editan desde Claude** (hook lo bloquea) ni se comitean jamás.

### Migraciones

SQL en `supabase/migrations/` (una por cambio, prefijo fecha `AAAAMMDD_`). Se aplican vía Supabase MCP o SQL Editor — nunca automáticamente desde el repo. Antes de tocar esquema/RLS, consulta `.claude/rules/arquitectura.md` (o usa el agente `revisor-db`).

### Convenciones (detalle en `.claude/rules/convenciones.md`)

- **UI**: las listas son tablas; acciones inline en la fila; creación vía wizards; interfaz en inglés.
- **Scripts**: cero dependencias npm — fetch nativo, parseo propio de `.env.local`.
- **Commits en español**, cortos y claros, con trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Changelog**: toda entrega relevante se registra como fila en el 📝 Changelog de Notion.
- **Secretos**: nunca en código, git, Notion ni chat — solo `.env.local` y Vercel env vars.

## Flujo de contribución (detalle completo en `.claude/rules/contribucion.md`)

Repo mantenido por **Ekinoxis** (William); **Ruben (SWRFM)** propone mejoras. `main` está protegida:

1. `git checkout main && git pull` → rama `propuesta/<tema-corto>`.
2. Cambios en la rama; **nunca commit/push directo a `main`**.
3. PR hacia `main` con la plantilla (en español, con capturas si toca UI).
4. Ekinoxis revisa antes del viernes (demo y triage); lo implementado va al 📝 Changelog.

No modifiques desde una propuesta: `supabase/` (migraciones), `.env*`, secretos, `.vercel/`, ni `package-lock.json` sin justificarlo en el PR. Propuestas grandes: primero un documento en `proposals/` (copiando `proposals/TEMPLATE.md`).
