# SWRFM — Sistema Inteligente de Inventario

App de inventario maestro para Southwest Ranches Farmers Market. Next.js (App Router) + Supabase (Postgres, Auth con roles admin/staff/vendor, Realtime, Storage). Demo: https://swrfm-demo.vercel.app

## Cómo trabajar en este repo (léelo antes de cambiar nada)

Este repo lo mantiene **Ekinoxis** (William). **Ruben (SWRFM)** propone cambios y mejoras desde su copia local, normalmente con Claude Code. Para que ninguna propuesta se pierda y todas queden registradas, validadas e implementadas, el flujo es SIEMPRE por Pull Request:

1. **Actualiza tu copia:** `git checkout main && git pull`
2. **Crea una rama de propuesta:** `git checkout -b propuesta/<tema-corto>` (ej.: `propuesta/boton-reimprimir-recibo`)
3. **Haz los cambios en la rama** (código, textos, documentos — lo que sea).
4. **Abre un Pull Request** hacia `main` usando la plantilla (se carga sola al abrir el PR). Describe qué propones y por qué, en español, con capturas si es algo visual.
5. **Ekinoxis revisa el PR**, comenta, y lo valida/implementa. Al quedar implementado se registra en el 📝 Changelog de Notion.

### Reglas para Claude Code en este repo

- **NUNCA hagas commit ni push directamente a `main`.** Todo cambio va en una rama `propuesta/*` y entra por PR.
- **No modifiques**: migraciones de base de datos (`supabase/`), archivos `.env*`, secretos, configuración de despliegue (`.vercel/`), ni `package-lock.json` (salvo que la propuesta lo requiera y se explique en el PR).
- **No despliegues** ni ejecutes acciones contra producción/Supabase — las propuestas se validan primero.
- **Propuestas grandes** (una funcionalidad nueva, un cambio de flujo): antes de escribir código, crea un documento en `proposals/` copiando `proposals/TEMPLATE.md` → `proposals/AAAA-MM-DD-<tema>.md`, y ábrelo como PR. Se discute ahí y luego se implementa.
- Escribe descripciones de commits y PRs **en español**, claras y cortas.
- Si la propuesta toca la interfaz, incluye capturas de pantalla en el PR.

### Después del PR

Ekinoxis responde cada PR antes del viernes de esa semana (día de demo y triage). Lo aceptado se prioriza en el sync del lunes, se implementa dentro del plan de horas, y queda en el 📝 Changelog. Nada se descarta sin explicar por qué.

Ideas y feedback que no son código van por el formulario: 📬 SWRFM — Feedback e Ideas (en Notion).
