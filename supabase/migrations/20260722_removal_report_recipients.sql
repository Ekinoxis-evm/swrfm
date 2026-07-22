-- Destinatarios del reporte nocturno, gestionados por el master admin desde la app en
-- vez de una env var. El cron los lee con la service key (bypass de RLS); si la tabla
-- está vacía, cae al `REMOVAL_REPORT_TO` de entorno como respaldo (ver la ruta del cron).

create table if not exists public.removal_report_recipients (
  email      text primary key,
  added_by   uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.removal_report_recipients is
  'A quién llega el reporte nocturno del removal log. Gestionado por el master admin.';

-- Helper de tier master, al estilo de current_role_of: SECURITY DEFINER para poder leer
-- profiles sin que la RLS de la política entre en recursión.
create or replace function public.is_master(uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select is_master from profiles where id = uid), false)
$$;

revoke execute on function public.is_master(uuid) from public, anon;
grant execute on function public.is_master(uuid) to authenticated;

alter table public.removal_report_recipients enable row level security;

-- Solo el master admin ve y edita la lista. El cron no depende de esto: usa la service key.
create policy recipients_master_read on public.removal_report_recipients
  for select to authenticated using (is_master(auth.uid()));

create policy recipients_master_insert on public.removal_report_recipients
  for insert to authenticated with check (is_master(auth.uid()));

create policy recipients_master_delete on public.removal_report_recipients
  for delete to authenticated using (is_master(auth.uid()));
