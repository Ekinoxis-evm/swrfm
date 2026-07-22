# Flujo de contribución (detalle)

Repo mantenido por **Ekinoxis**; **Ruben (SWRFM)** propone mejoras, normalmente con Claude Code. `main` está protegida (PR + 1 revisión; sin force-push).

## El flujo, paso a paso

1. `git checkout main && git pull`
2. Rama nueva: `git checkout -b propuesta/<tema-corto>` (ej. `propuesta/boton-reimprimir`)
3. Cambios SOLO en la rama. Nunca commit ni push a `main`.
4. PR hacia `main` — la plantilla se carga sola. En español; capturas si toca UI; marcar el objetivo del plan (1–6).
5. Ekinoxis revisa y responde **antes del viernes** (día de demo y triage). Nada se descarta sin explicar por qué.
6. Lo aceptado se prioriza el lunes, se implementa dentro del plan de horas y queda en el 📝 Changelog de Notion.

## Qué NO tocar desde una propuesta

- `supabase/` (migraciones) — se diseñan con Ekinoxis; el agente `revisor-db` ayuda a evaluar impacto.
- `.env*` — nunca (hook lo bloquea). Secretos jamás en código ni en el PR.
- `.vercel/`, configuración de despliegue, `package-lock.json` (salvo que la propuesta lo requiera y se explique en el PR).

## Propuestas grandes

Funcionalidad nueva o cambio de flujo → primero un documento: copiar `proposals/TEMPLATE.md` → `proposals/AAAA-MM-DD-<tema>.md`, abrirlo como PR y discutirlo antes de construir.

## Canales que NO son PR

- Ideas/feedback/bugs del día a día → formulario público 📬 (Notion).
- Urgencias operativas → WhatsApp a William, y luego se registra.
