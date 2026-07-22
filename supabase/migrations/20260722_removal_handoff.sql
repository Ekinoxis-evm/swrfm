-- Removal log: puerto fiel del handoff de Ruben (`swarm_buildapp/docs/removal handoff/`)
-- sobre el ledger de Supabase. Cubre §3 (contrato de API), §4 (modelos de datos)
-- y §6 (los puntos de seguridad que el handoff pedía resolver).
--
-- Decisiones de diseño:
--   * El legado llevaba DOS contadores independientes (cajas + unidades sueltas) en un
--     blob JSON. Aquí se preservan como dimensiones del MISMO ledger — nunca una copia
--     paralela (invariante 4 de arquitectura.md). `delta` sigue siendo el total en
--     unidades base; `cases_delta` / `units_delta` describen cómo se repartió.
--   * El "ledger reversible" del legado (editar/anular un retiro y que el saldo vuelva)
--     se implementa con movimientos compensatorios, no borrando historial.
--   * Firmar / editar / anular son funciones SECURITY DEFINER que exigen rol admin.
--     Se retira el policy de UPDATE/DELETE directo sobre `removals`: el legado tenía
--     PINs de manager en el JavaScript del cliente (§6.1) y aquí el control vive en Postgres.

-- ---------------------------------------------------------------------------
-- 1. Catálogo: cajas por producto y umbral de stock bajo (§4b perCase / lowCases)
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists units_per_case integer,
  add column if not exists low_stock_cases integer not null default 2;

comment on column public.products.units_per_case is
  'Unidades por caja (perCase del legado). Null = el producto solo se maneja por unidad.';
comment on column public.products.low_stock_cases is
  'Umbral de alerta en cajas (lowCases del legado).';

-- Los 4 proveedores del cooler del removal legado (§5). El flag `cooler_relevant`
-- venía marcado en productos que no son de estos proveedores, así que el selector de
-- retiros mostraba el catálogo equivocado. Se marca la lista correcta sin desmarcar
-- nada (la limpieza del resto se decide con Ruben).
update public.products
   set cooler_relevant = true
 where archived_at is null
   and vendor_name in (
     'US Wellness Meats',
     'Florida Fresh Meat',
     'Lake Meadow Naturals LLC',
     'Pennsylvania Farms'
   );

-- ---------------------------------------------------------------------------
-- 2. Ledger: dimensiones caja / unidad
-- ---------------------------------------------------------------------------

alter type movement_reason add value if not exists 'break_case';

alter table public.inventory_movements
  add column if not exists cases_delta numeric not null default 0,
  add column if not exists units_delta numeric not null default 0;

comment on column public.inventory_movements.cases_delta is
  'Cajas selladas ganadas/perdidas. delta = cases_delta * units_per_case + units_delta.';
comment on column public.inventory_movements.units_delta is
  'Unidades sueltas ganadas/perdidas.';

alter table public.inventory_levels
  add column if not exists cases_on_hand numeric not null default 0,
  add column if not exists units_on_hand numeric not null default 0;

-- Escritores antiguos (receiving, count_adjust, ventas) solo mandan `delta`: se
-- interpreta como unidades sueltas para que siempre valga
-- on_hand = cases_on_hand * units_per_case + units_on_hand.
create or replace function public.default_movement_dims()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.cases_delta = 0 and new.units_delta = 0 and new.delta <> 0 then
    new.units_delta := new.delta;
  end if;
  return new;
end $$;

drop trigger if exists trg_default_movement_dims on public.inventory_movements;
create trigger trg_default_movement_dims
  before insert on public.inventory_movements
  for each row execute function public.default_movement_dims();

create or replace function public.apply_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into inventory_levels (toast_guid, on_hand, cases_on_hand, units_on_hand, updated_at)
  values (new.toast_guid, new.delta, new.cases_delta, new.units_delta, now())
  on conflict (toast_guid) do update set
    on_hand       = inventory_levels.on_hand + new.delta,
    cases_on_hand = inventory_levels.cases_on_hand + new.cases_delta,
    units_on_hand = inventory_levels.units_on_hand + new.units_delta,
    updated_at    = now();
  return new;
end $$;

-- Los saldos que ya existían nacieron sin dimensiones: se asientan como unidades sueltas.
update public.inventory_levels
   set units_on_hand = on_hand
 where cases_on_hand = 0 and units_on_hand = 0 and on_hand <> 0;

-- ---------------------------------------------------------------------------
-- 3. removals: campos del RemovalRecord del handoff (§4a)
-- ---------------------------------------------------------------------------

alter table public.removals
  add column if not exists vendor_name text,
  add column if not exists remove_by text not null default 'case',
  add column if not exists local_date date not null default (now() at time zone 'America/New_York')::date,
  add column if not exists signed_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id),
  add column if not exists edited_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'removals_remove_by_check') then
    alter table public.removals
      add constraint removals_remove_by_check check (remove_by in ('case', 'unit'));
  end if;
end $$;

comment on column public.removals.remove_by is
  'Cómo se retiró la cantidad: ''case'' o ''unit'' (remove_by del legado).';
comment on column public.removals.local_date is
  'Día operativo en America/New_York — el legado agrupa el log por día local, no UTC.';

create index if not exists removals_local_date_idx on public.removals (local_date desc);

-- Rellena el día local de las filas previas a partir de created_at.
update public.removals
   set local_date = (created_at at time zone 'America/New_York')::date
 where local_date is distinct from (created_at at time zone 'America/New_York')::date;

-- ---------------------------------------------------------------------------
-- 4. Operaciones atómicas (reemplazan los endpoints §3 del server.js legado)
-- ---------------------------------------------------------------------------

-- Convierte cantidad + modo en (delta total, cajas, unidades) según units_per_case.
create or replace function public.removal_dims(
  p_toast_guid uuid,
  p_qty numeric,
  p_remove_by text,
  out d_total numeric,
  out d_cases numeric,
  out d_units numeric
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  upc integer;
begin
  select units_per_case into upc from products where toast_guid = p_toast_guid;
  if p_remove_by = 'case' then
    d_cases := p_qty;
    d_units := 0;
    d_total := p_qty * coalesce(upc, 1);
  else
    d_cases := 0;
    d_units := p_qty;
    d_total := p_qty;
  end if;
end $$;

-- POST /removal/add — retiro + movimiento del ledger en una sola transacción.
create or replace function public.log_removal(
  p_toast_guid uuid,
  p_qty numeric,
  p_remove_by text default 'case',
  p_weight_lb numeric default 0,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role user_role := current_role_of(auth.uid());
  v_name text;
  v_vendor text;
  v_id uuid;
  dims record;
begin
  if v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Solo admin o staff pueden registrar retiros';
  end if;
  if p_remove_by not in ('case', 'unit') then
    raise exception 'remove_by inválido: %', p_remove_by;
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  select name, vendor_name into v_name, v_vendor from products where toast_guid = p_toast_guid;
  if v_name is null then
    raise exception 'Producto no encontrado';
  end if;

  insert into removals (toast_guid, item_name, vendor_name, qty, remove_by, weight_lb, note, removed_by)
  values (p_toast_guid, v_name, v_vendor, p_qty, p_remove_by, coalesce(p_weight_lb, 0), p_note, auth.uid())
  returning id into v_id;

  dims := removal_dims(p_toast_guid, p_qty, p_remove_by);
  insert into inventory_movements (toast_guid, delta, cases_delta, units_delta, reason, ref_id, created_by, note)
  values (p_toast_guid, -dims.d_total, -dims.d_cases, -dims.d_units, 'removal', v_id, auth.uid(), p_note);

  return v_id;
end $$;

-- POST /removal/sign
create or replace function public.sign_removal(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if current_role_of(auth.uid()) <> 'admin' then
    raise exception 'Solo un manager (admin) puede firmar retiros';
  end if;
  update removals
     set signed_by = auth.uid(), signed_at = now()
   where id = p_id and signed_by is null and voided_at is null;
end $$;

-- POST /removal/sign-all — firma en lote el día operativo completo.
create or replace function public.sign_all_removals(p_date date default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  n integer;
begin
  if current_role_of(auth.uid()) <> 'admin' then
    raise exception 'Solo un manager (admin) puede firmar retiros';
  end if;
  update removals
     set signed_by = auth.uid(), signed_at = now()
   where local_date = coalesce(p_date, (now() at time zone 'America/New_York')::date)
     and signed_by is null
     and voided_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- POST /removal/update — corrige la cantidad y compensa la diferencia en el ledger.
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

  select * into r from removals where id = p_id;
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

  -- Movimiento compensatorio por la diferencia: el historial nunca se reescribe.
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

-- POST /removal/delete — anular. El legado borraba la fila; aquí se marca anulada y
-- se devuelve el stock con un movimiento inverso (ledger reversible, §4b).
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

  select * into r from removals where id = p_id;
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

-- "Romper caja": 1 caja sellada → N unidades sueltas. Total sin cambio.
create or replace function public.break_case(p_toast_guid uuid, p_cases numeric default 1)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role user_role := current_role_of(auth.uid());
  upc integer;
begin
  if v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Solo admin o staff pueden romper cajas';
  end if;
  if p_cases is null or p_cases <= 0 then
    raise exception 'Cantidad de cajas inválida';
  end if;

  select units_per_case into upc from products where toast_guid = p_toast_guid;
  if upc is null or upc <= 0 then
    raise exception 'El producto no tiene unidades por caja configuradas';
  end if;

  insert into inventory_movements (toast_guid, delta, cases_delta, units_delta, reason, created_by, note)
  values (p_toast_guid, 0, -p_cases, p_cases * upc, 'break_case', auth.uid(),
          format('romper %s caja(s) → %s unidades', p_cases, p_cases * upc));
end $$;

-- ---------------------------------------------------------------------------
-- 5. RLS (§6.1, §6.2): firmar/editar/anular solo por las funciones de arriba
-- ---------------------------------------------------------------------------

drop policy if exists removals_rw on public.removals;

create policy removals_read on public.removals
  for select to authenticated
  using (current_role_of(auth.uid()) = any (array['admin'::user_role, 'staff'::user_role]));

create policy removals_insert on public.removals
  for insert to authenticated
  with check (current_role_of(auth.uid()) = any (array['admin'::user_role, 'staff'::user_role]));

-- Deliberadamente NO hay policy de UPDATE ni DELETE: firmar, editar y anular pasan
-- por sign_removal / update_removal / void_removal, que exigen rol admin en Postgres.

-- Postgres concede EXECUTE a PUBLIC por defecto, así que estas funciones quedarían
-- expuestas en /rest/v1/rpc también para `anon`. Cada una valida el rol y fallaría,
-- pero no tienen por qué ser alcanzables sin sesión: se revoca y se concede solo a
-- `authenticated`. `removal_dims` y `apply_movement` son internas — nadie las llama por REST.
revoke execute on function public.log_removal(uuid, numeric, text, numeric, text) from public, anon;
revoke execute on function public.sign_removal(uuid) from public, anon;
revoke execute on function public.sign_all_removals(date) from public, anon;
revoke execute on function public.update_removal(uuid, numeric, text, numeric, text) from public, anon;
revoke execute on function public.void_removal(uuid, text) from public, anon;
revoke execute on function public.break_case(uuid, numeric) from public, anon;
revoke execute on function public.removal_dims(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.apply_movement() from public, anon, authenticated;

grant execute on function public.log_removal(uuid, numeric, text, numeric, text) to authenticated;
grant execute on function public.sign_removal(uuid) to authenticated;
grant execute on function public.sign_all_removals(date) to authenticated;
grant execute on function public.update_removal(uuid, numeric, text, numeric, text) to authenticated;
grant execute on function public.void_removal(uuid, text) to authenticated;
grant execute on function public.break_case(uuid, numeric) to authenticated;
