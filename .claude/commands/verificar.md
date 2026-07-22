---
description: Verificación estándar del repo (tipos + lint) — NUNCA npm run build local
---

1. `npx tsc --noEmit` — debe salir limpio.
2. `npx eslint` sobre los archivos modificados (`git diff --name-only main -- '*.ts' '*.tsx'`).
3. Si hay cambios de UI o flujo: recuerda que el build real lo verifica el preview de Vercel al abrir el PR — no ejecutes `npm run build` local (prohibitivamente lento en esta máquina).
4. Resume: qué pasó, qué falló y el fix propuesto.
