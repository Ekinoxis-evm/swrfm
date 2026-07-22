---
description: Revisar un PR de propuesta (flujo Ruben) — análisis, veredicto y respuesta en el PR
---

Revisión de un PR entrante (normalmente rama `propuesta/*` de Ruben). Con el número de PR ($ARGUMENTS o pregunta cuál):

1. `gh pr view <n>` + `gh pr diff <n>` — entiende QUÉ propone y POR QUÉ (la plantilla trae el objetivo del plan).
2. Verifica contra las reglas: ¿toca `supabase/`, `.env*`, `.vercel/`, `package-lock.json` sin justificación en el PR? ¿Sigue las convenciones (`.claude/rules/convenciones.md`)? Si toca esquema/consultas de datos → usa el agente `revisor-db`.
3. Corre verificación sobre la rama: `npx tsc --noEmit` + eslint de los archivos del diff.
4. Veredicto: **aprobar** / **pedir cambios** (concretos, amables — Ruben no es desarrollador de oficio) / **discutir el viernes**. Nada se descarta sin explicar por qué.
5. Publica la respuesta como comentario en el PR (`gh pr comment` o review), en español, reconociendo la idea antes de las observaciones.
6. Si se aprueba y mergea: fila en el 📝 Changelog de Notion + actualizar el 🗂️ tablero. El compromiso contractual: responder antes del viernes de esa semana.
