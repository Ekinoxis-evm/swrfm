# Convenciones del repo

## Doctrina de UI

- **Las listas son tablas** — no cards, no grids de tarjetas para datos tabulares.
- **Acciones inline en la fila** — editar/archivar/etc. directamente donde está el dato, no en pantallas aparte.
- **Creación vía wizards** — flujos de varios pasos (`src/components/wizard.tsx`) para crear entidades (receiving, market days).
- **Interfaz en inglés** — la UI la usan operadores del mercado en inglés; la documentación del repo es en español.

## Scripts: cero dependencias

Todo script en `scripts/` sigue el mismo patrón:

- `.mjs` con `fetch` nativo de Node — **sin instalar paquetes npm**.
- Lee `.env.local` con parseo propio (ver cabecera de cualquier script existente) y hace merge con `process.env`.
- Solo-lectura por defecto; las escrituras van detrás de un flag explícito (`--apply`).
- Nunca imprime secretos; los informes con datos del negocio se escriben **fuera del repo**.

## Verificación

- `npx tsc --noEmit` — chequeo de tipos de todo el proyecto.
- `npx eslint <archivos cambiados>` — lint dirigido.
- **NUNCA `npm run build` local** — es prohibitivamente lento en esta máquina. El build lo valida el **preview de Vercel** de cada PR.
- No ejecutar acciones contra producción ni contra Supabase sin validación previa.

## Commits y PRs

- Mensajes **en español**, cortos y claros (qué y por qué).
- Trailer obligatorio en commits hechos con Claude:

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

- PRs con la plantilla de `.github/PULL_REQUEST_TEMPLATE.md`; capturas si toca la interfaz.

## Disciplina de changelog

Toda entrega relevante (feature, fix visible, migración, integración) se registra como una fila en el **📝 Changelog de Notion** al quedar implementada. Si cierras algo y no está en el changelog, no está cerrado.

## Secretos — jamás en el repo

- Credenciales SOLO en `.env.local` (gitignored) y en Vercel → Environment Variables.
- Nunca en código, git, Notion, chat ni capturas de pantalla.
- Los archivos `.env*` no se editan desde Claude (hook `PreToolUse` lo bloquea) — se editan a mano.
- `SUPABASE_SERVICE_ROLE_KEY` es solo-servidor; jamás en el bundle del cliente.
- Datos del negocio (catálogos, costos, márgenes, ventas) viven fuera del repo.
