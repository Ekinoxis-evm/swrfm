---
description: Smoke test de integraciones Toast + Shopify (solo lectura)
---

Ejecuta `node scripts/smoke-integrations.mjs` e interpreta el resultado:

- Ambos canales ✅ → resume en una línea (tokens emitidos, catálogo/productos visibles).
- Algún ❌ → diagnostica: 401 Shopify = client credentials o dominio myshopify; "Malformed restaurant identifier" = GUID de Toast corrupto en `.env.local` (¡buffer del IDE! — pedir al usuario recargar el archivo); 403 Toast = scope ausente en el credential set (los scopes son fijos por credencial).
- Nunca imprimas valores de `.env.local`; el script ya imprime solo estados.
