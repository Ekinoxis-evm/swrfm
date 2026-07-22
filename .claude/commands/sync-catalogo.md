---
description: Sync de catálogo Toast → informe de conciliación (y aplicar con confirmación)
---

1. Ejecuta `node scripts/sync-toast-catalog.mjs ../catalog-v12-links.json` (dry-run).
2. Resume el informe: conteos de las 3 fuentes, nuevos, retirados, renombrados, precios, duplicados. El informe completo queda FUERA del repo (junto al archivo de links) — no lo muevas al repo: contiene datos del negocio.
3. Si hay cambios, muestra los más relevantes y PREGUNTA antes de ejecutar con `--apply`.
4. Tras aplicar: re-ejecuta el dry-run para verificar convergencia (0/0/0), marca `archived_at` si hay retirados nuevos, y registra una fila en el 📝 Changelog de Notion.
