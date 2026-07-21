-- Productos retirados de Toast no se borran (tienen historial en el ledger):
-- se marcan como archivados. Ejecutar en Supabase SQL Editor.
alter table public.products add column if not exists archived_at timestamptz;
comment on column public.products.archived_at is
  'Marcado por el sync cuando el item ya no existe en el catálogo vivo de Toast.';
