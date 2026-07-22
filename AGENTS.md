# AGENTS.md — Sistema Inteligente de Inventario (SWRFM)

Guía para cualquier agente de IA trabajando en este repo (Claude Code, Codex, Cursor u otros).

## Empieza aquí

1. **`CLAUDE.md`** — qué es el proyecto, mapa de arquitectura y cómo trabajar (verificación, scripts, migraciones).
2. **`.claude/rules/`** — `arquitectura.md` (modelo de datos e invariantes NO negociables), `convenciones.md` (UI, scripts, commits, secretos), `contribucion.md` (flujo de PRs).
3. **`.claude/agents/`** — especialistas por dominio (inventario, integraciones, proveedores) y revisores (db, ux). Úsalos: concentran las lecciones ya aprendidas.

## Reglas mínimas absolutas

- Verificación: `npx tsc --noEmit` + eslint de lo tocado. **NUNCA `npm run build` local** — el build lo valida el preview de Vercel del PR.
- `main` protegida: todo entra por PR. Ramas `propuesta/*` (cliente) o `feat/*`/`docs/*` (Ekinoxis).
- **Jamás** edites `.env*` (hook lo bloquea), comitees secretos o datos del negocio, escribas a `inventory_levels` a mano, o borres productos (soft-delete con `archived_at`).
- El inventario es un **ledger**; `toast_guid` es la llave; nombre/precio los posee el sync de Toast.
- Commits en español + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Entregas → 📝 Changelog de Notion.

## Contexto de negocio en una línea

Inventario maestro para Southwest Ranches Farmers Market: Toast POS (físico) + Shopify (online) + pop-ups → un solo ledger en Supabase, operado por administradores, personal y proveedores con cuentas propias.
