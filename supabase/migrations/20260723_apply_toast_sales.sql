-- Atomic, concurrency-safe posting of Toast sale lines into the floor ledger.
--
-- The webhook reconciles a recent window on every event, so two events firing close together
-- can process the same selections at once. Doing the read-delta-write in one transaction with a
-- per-selection row lock makes concurrent calls serialize instead of double-drawing the floor.
-- Selling N more units of a selection posts a −N movement at location 'floor'; a later void
-- drops net and posts the compensating +movement. Idempotent by selection GUID.

create or replace function public.apply_toast_sales(p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  l record;
  old numeric;
  d numeric;
  posted int := 0;
  units numeric := 0;
begin
  for l in
    select * from jsonb_to_recordset(p_lines) as x(
      selection uuid, order_guid uuid, toast_guid uuid, net numeric, business_date text, name text
    )
  loop
    -- Ensure the row exists so the FOR UPDATE below has something to lock (new selections too).
    insert into toast_sale_lines (selection_guid, order_guid, toast_guid, qty, business_date)
      values (l.selection, l.order_guid, l.toast_guid, 0, l.business_date)
      on conflict (selection_guid) do nothing;

    select qty into old from toast_sale_lines where selection_guid = l.selection for update;
    old := coalesce(old, 0);
    d := l.net - old;

    if d <> 0 then
      insert into inventory_movements (toast_guid, delta, location, reason, ref_id, note)
        values (l.toast_guid, -d, 'floor', 'sale_toast', l.selection,
                left('Toast sale · ' || coalesce(l.name, ''), 120));
      update toast_sale_lines
         set qty = l.net, order_guid = l.order_guid, updated_at = now()
       where selection_guid = l.selection;
      posted := posted + 1;
      units := units + d;
    end if;
  end loop;

  return jsonb_build_object('posted', posted, 'units', units);
end $$;

-- Only the cron/webhook (service role key) post sales.
revoke execute on function public.apply_toast_sales(jsonb) from public, anon, authenticated;
grant execute on function public.apply_toast_sales(jsonb) to service_role;
