-- Audit fixes (2026-07-23):
--  1/2. Lock the removal row (SELECT ... FOR UPDATE) before deriving and posting the
--       compensating ledger movement, so two concurrent void/edit calls on the same
--       removal can't both pass the "already voided/edited" guard and double-credit
--       stock (TOCTOU). Mirrors the FOR UPDATE discipline in approve_transfer.
--  3.   Drop the direct INSERT policy on `removals`. Writes must go through log_removal()
--       (SECURITY DEFINER), like stock_transfers — otherwise an authenticated client could
--       POST /rest/v1/removals and create a removal with no matching inventory_movements
--       row (ledger desync, invariante #4).

create or replace function public.void_removal(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r removals%rowtype;
  d record;
begin
  if current_role_of(auth.uid()) <> 'admin' then
    raise exception 'Solo un manager (admin) puede anular retiros';
  end if;

  select * into r from removals where id = p_id for update;
  if r.id is null then
    raise exception 'Retiro no encontrado';
  end if;
  if r.voided_at is not null then
    return;
  end if;

  update removals
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
   where id = p_id;

  if r.toast_guid is not null then
    d := removal_dims(r.toast_guid, r.qty, r.remove_by);
    insert into inventory_movements (toast_guid, delta, cases_delta, units_delta, reason, ref_id, created_by, note)
    values (r.toast_guid, d.d_total, d.d_cases, d.d_units, 'removal', p_id, auth.uid(),
            coalesce('anulación: ' || p_reason, 'anulación de retiro'));
  end if;
end $$;

create or replace function public.update_removal(
  p_id uuid,
  p_qty numeric,
  p_remove_by text default null,
  p_weight_lb numeric default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r removals%rowtype;
  new_mode text;
  old_d record;
  new_d record;
begin
  if current_role_of(auth.uid()) <> 'admin' then
    raise exception 'Solo un manager (admin) puede editar retiros';
  end if;

  select * into r from removals where id = p_id for update;
  if r.id is null then
    raise exception 'Retiro no encontrado';
  end if;
  if r.voided_at is not null then
    raise exception 'El retiro está anulado';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  new_mode := coalesce(p_remove_by, r.remove_by);
  if new_mode not in ('case', 'unit') then
    raise exception 'remove_by inválido: %', new_mode;
  end if;

  old_d := removal_dims(r.toast_guid, r.qty, r.remove_by);
  new_d := removal_dims(r.toast_guid, p_qty, new_mode);

  update removals
     set qty        = p_qty,
         remove_by  = new_mode,
         weight_lb  = coalesce(p_weight_lb, r.weight_lb),
         note       = coalesce(p_note, r.note),
         edited_by  = auth.uid(),
         edited_at  = now()
   where id = p_id;

  if r.toast_guid is not null
     and (new_d.d_total <> old_d.d_total
          or new_d.d_cases <> old_d.d_cases
          or new_d.d_units <> old_d.d_units) then
    insert into inventory_movements (toast_guid, delta, cases_delta, units_delta, reason, ref_id, created_by, note)
    values (
      r.toast_guid,
      old_d.d_total - new_d.d_total,
      old_d.d_cases - new_d.d_cases,
      old_d.d_units - new_d.d_units,
      'removal',
      p_id,
      auth.uid(),
      format('corrección de retiro: %s %s → %s %s', r.qty, r.remove_by, p_qty, new_mode)
    );
  end if;
end $$;

drop policy if exists removals_insert on public.removals;
