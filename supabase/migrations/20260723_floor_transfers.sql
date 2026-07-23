-- Transferencias de stock storage ↔ piso (proposals/2026-07-22-traslado-a-piso.md).
--
-- El "removal" reinterpretado como TRANSFERENCIA: mover producto entre el almacén (cooler)
-- y el piso de venta, en cualquiera de los dos sentidos. NO es venta ni merma — no cambia
-- el total en existencia, solo dónde está. Lo solicita un empleado (staff) y lo APRUEBA un
-- admin; el saldo solo se mueve al aprobar.
--
-- Modelo: el ledger gana la dimensión `location`. Una transferencia aprobada son DOS
-- asientos que comparten ref_id — uno −origen y uno +destino — así el total queda intacto
-- por construcción (−q + q = 0) y nunca se mutan contadores a mano (invariante 4).

-- ---------------------------------------------------------------------------
-- 1. Ubicación en el ledger y saldos por ubicación
-- ---------------------------------------------------------------------------

alter type movement_reason add value if not exists 'floor_transfer';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'stock_location') then
    create type stock_location as enum ('storage', 'floor');
  end if;
  if not exists (select 1 from pg_type where typname = 'transfer_direction') then
    create type transfer_direction as enum ('to_floor', 'to_storage');
  end if;
  if not exists (select 1 from pg_type where typname = 'transfer_status') then
    create type transfer_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

alter table public.inventory_movements
  add column if not exists location stock_location not null default 'storage';

comment on column public.inventory_movements.location is
  'Ubicación afectada por el asiento. Una transferencia son dos asientos: −origen y +destino.';

alter table public.inventory_levels
  add column if not exists storage_on_hand numeric not null default 0,
  add column if not exists floor_on_hand   numeric not null default 0;

comment on column public.inventory_levels.storage_on_hand is 'En almacén (cooler). on_hand = storage + floor.';
comment on column public.inventory_levels.floor_on_hand   is 'En el piso de venta. Baja al vender (integración de ventas pendiente).';

-- Saldos previos: todo lo que ya había vive en storage.
update public.inventory_levels
   set storage_on_hand = on_hand
 where storage_on_hand = 0 and floor_on_hand = 0 and on_hand <> 0;

-- apply_movement definitivo: mantiene total, cajas/unidades (del removal handoff) y ahora
-- también el bucket por ubicación. Es la última definición del trigger — superset de todas.
create or replace function public.apply_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into inventory_levels (
    toast_guid, on_hand, cases_on_hand, units_on_hand, storage_on_hand, floor_on_hand, updated_at
  )
  values (
    new.toast_guid, new.delta, new.cases_delta, new.units_delta,
    case when new.location = 'floor' then 0 else new.delta end,
    case when new.location = 'floor' then new.delta else 0 end,
    now()
  )
  on conflict (toast_guid) do update set
    on_hand         = inventory_levels.on_hand + new.delta,
    cases_on_hand   = inventory_levels.cases_on_hand + new.cases_delta,
    units_on_hand   = inventory_levels.units_on_hand + new.units_delta,
    storage_on_hand = inventory_levels.storage_on_hand + (case when new.location = 'floor' then 0 else new.delta end),
    floor_on_hand   = inventory_levels.floor_on_hand + (case when new.location = 'floor' then new.delta else 0 end),
    updated_at      = now();
  return new;
end $$;

revoke execute on function public.apply_movement() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Transferencias (pending → approved / rejected), bidireccionales
-- ---------------------------------------------------------------------------

create table if not exists public.stock_transfers (
  id            uuid primary key default gen_random_uuid(),
  toast_guid    uuid not null,
  item_name     text not null,
  qty           numeric not null check (qty > 0),
  direction     transfer_direction not null,
  status        transfer_status not null default 'pending',
  note          text,
  -- Referencian profiles (no auth.users) para que PostgREST pueda unir el nombre
  -- del solicitante / decisor, igual que removals.removed_by / signed_by.
  requested_by  uuid references public.profiles(id),
  requested_at  timestamptz not null default now(),
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  reject_reason text,
  local_date    date not null default (now() at time zone 'America/New_York')::date
);

comment on table public.stock_transfers is
  'Transferencias storage ↔ piso. El empleado solicita; el admin aprueba/rechaza.';

create index if not exists stock_transfers_pending_idx on public.stock_transfers (status, local_date desc);

alter table public.stock_transfers enable row level security;

-- Staff y admin ven la cola. Escribir (solicitar/aprobar/rechazar) va por las funciones.
create policy stock_transfers_read on public.stock_transfers
  for select to authenticated
  using (current_role_of(auth.uid()) = any (array['admin'::user_role, 'staff'::user_role]));

-- ---------------------------------------------------------------------------
-- 3. Operaciones
-- ---------------------------------------------------------------------------

-- Saldo del bucket de ORIGEN según el sentido de la transferencia.
create or replace function public.transfer_source_qty(p_toast_guid uuid, p_direction transfer_direction)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    case when p_direction = 'to_floor'
         then (select storage_on_hand from inventory_levels where toast_guid = p_toast_guid)
         else (select floor_on_hand   from inventory_levels where toast_guid = p_toast_guid)
    end, 0)
$$;

-- Empleado (o admin) solicita mover `qty` en un sentido. No toca saldos: queda pendiente.
create or replace function public.request_transfer(
  p_toast_guid uuid,
  p_qty numeric,
  p_direction transfer_direction,
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
  v_src numeric;
  v_id uuid;
begin
  if v_role is null or v_role not in ('admin', 'staff') then
    raise exception 'Solo admin o staff pueden solicitar transferencias';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  select name into v_name from products where toast_guid = p_toast_guid;
  if v_name is null then
    raise exception 'Producto no encontrado';
  end if;

  v_src := transfer_source_qty(p_toast_guid, p_direction);
  if v_src < p_qty then
    raise exception 'No hay suficiente en el origen (% disponibles)', v_src;
  end if;

  insert into stock_transfers (toast_guid, item_name, qty, direction, note, requested_by)
  values (p_toast_guid, v_name, p_qty, p_direction, p_note, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

-- Admin aprueba: recién aquí se mueve el saldo (−origen, +destino), total intacto.
create or replace function public.approve_transfer(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  t stock_transfers%rowtype;
  v_src numeric;
  src_loc stock_location;
  dst_loc stock_location;
begin
  if current_role_of(auth.uid()) <> 'admin' then
    raise exception 'Solo un manager (admin) puede aprobar transferencias';
  end if;

  select * into t from stock_transfers where id = p_id for update;
  if t.id is null then
    raise exception 'Transferencia no encontrada';
  end if;
  if t.status <> 'pending' then
    raise exception 'La transferencia ya fue %', t.status;
  end if;

  v_src := transfer_source_qty(t.toast_guid, t.direction);
  if v_src < t.qty then
    raise exception 'Ya no hay suficiente en el origen (% disponibles)', v_src;
  end if;

  if t.direction = 'to_floor' then
    src_loc := 'storage'; dst_loc := 'floor';
  else
    src_loc := 'floor'; dst_loc := 'storage';
  end if;

  -- Dos asientos, mismo ref_id: total intacto (−q + q = 0), origen baja, destino sube.
  insert into inventory_movements (toast_guid, delta, location, reason, ref_id, created_by, note)
  values (t.toast_guid, -t.qty, src_loc, 'floor_transfer', t.id, auth.uid(), 'transferencia'),
         (t.toast_guid,  t.qty, dst_loc, 'floor_transfer', t.id, auth.uid(), 'transferencia');

  update stock_transfers
     set status = 'approved', decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;

create or replace function public.reject_transfer(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if current_role_of(auth.uid()) <> 'admin' then
    raise exception 'Solo un manager (admin) puede rechazar transferencias';
  end if;

  update stock_transfers
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(), reject_reason = p_reason
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'Transferencia no encontrada o ya decidida';
  end if;
end $$;

revoke execute on function public.transfer_source_qty(uuid, transfer_direction) from public, anon, authenticated;
revoke execute on function public.request_transfer(uuid, numeric, transfer_direction, text) from public, anon;
revoke execute on function public.approve_transfer(uuid) from public, anon;
revoke execute on function public.reject_transfer(uuid, text) from public, anon;
grant execute on function public.request_transfer(uuid, numeric, transfer_direction, text) to authenticated;
grant execute on function public.approve_transfer(uuid) to authenticated;
grant execute on function public.reject_transfer(uuid, text) to authenticated;
