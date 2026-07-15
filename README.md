# SWR Inventory

Master inventory system for **Southwest Ranches Farmers Market** — built by [Ekinoxis](https://github.com/wmb81321).

One source of truth for inventory across every sales channel: the physical market (Toast POS), the Shopify online store, and traveling pop-up sales — with per-person accounts, real-time collaborative editing, and a vendor portal for accounts payable.

## Stack

- **Next.js** (App Router, TypeScript, Tailwind CSS v4)
- **Supabase** — Postgres, Auth (admin / staff / vendor roles via RLS), Realtime
- **Vercel** — hosting and CI/CD

## Architecture principles

- **Products are keyed by `toast_guid`** — Toast POS is the master of record for the catalog.
- **Inventory is a ledger**: every change is an `inventory_movements` row (receiving, removal, count adjustment, sale) with full attribution; `inventory_levels` is the running total maintained by a trigger. Nothing is ever silently overwritten.
- **Row-level concurrent editing**: receiving sessions sync per line over Supabase Realtime, with an active-input guard so a remote update never clobbers what someone is typing.
- **Security lives in the database**: role checks are Postgres RLS policies, not client-side code.

## Development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
```

### Seeding the catalog

The product catalog is client business data and is **not** part of this repository. Seed it from a Toast catalog export kept outside the repo:

```bash
node scripts/seed-catalog.mjs /path/to/catalog_v1.json
```

The script signs in as an admin account (RLS permits admins to write products) — no service-role key required.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Used only by the seed script |

No secrets are committed to this repository. `.env.local` is gitignored.

## Status

Demo / initial version — the foundation for the phased build described in the project proposal (receiving, counts, removals, admin dashboard, vendor portal live; Toast & Shopify sync integrations arrive in Phase 3).
