# Agentes del proyecto

Subagentes de Claude Code específicos de este repo. Se invocan automáticamente cuando la tarea encaja con su descripción, o explícitamente por nombre.

| Agente | Cuándo se usa |
|---|---|
| `revisor-db` | Antes de migraciones o cambios que toquen `products`, el ledger, `profiles` o RLS — evalúa impacto contra las invariantes de `.claude/rules/arquitectura.md` |

Los skills de Shopify (`shopify-admin`, `shopify-dev`) viven en `.claude/skills/` y cargan solos al trabajar con la Admin API.
