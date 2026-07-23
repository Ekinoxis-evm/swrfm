-- Toast sales ingestion → draws down floor stock.
--
-- A cron polls Toast `ordersBulk` by modified time and reconciles each sold line into
-- the ledger: selling N units posts a −N movement at location 'floor' (reason sale_toast),
-- so on_hand and floor_on_hand both drop. Reconciled, not append-only — if an order is
-- later voided/refunded, the line's net qty drops and we post the compensating +movement,
-- exactly like the removal/transfer ledgers. Idempotent: an unchanged order posts nothing.

-- Net sold units we've already reflected in the ledger, keyed by Toast selection GUID.
create table if not exists public.toast_sale_lines (
  selection_guid uuid primary key,
  order_guid     uuid not null,
  toast_guid     uuid not null,
  qty            numeric not null default 0,   -- net units currently posted (post deltas of this)
  business_date  text,
  updated_at     timestamptz not null default now()
);

comment on table public.toast_sale_lines is
  'Per Toast selection: net units sold already posted to the ledger. The cron posts only deltas.';

create index if not exists toast_sale_lines_order_idx on public.toast_sale_lines (order_guid);

-- Poll watermark (and room for other pollers). Initialized to "now" on first run so we
-- never backfill historical sales into inventory.
create table if not exists public.sync_state (
  key        text primary key,
  watermark  timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.sync_state is 'Cursor per background poller (e.g. toast_sales watermark).';

alter table public.toast_sale_lines enable row level security;
alter table public.sync_state enable row level security;

-- Read-only visibility for the team; all writes go through the cron on the service key.
create policy toast_sale_lines_read on public.toast_sale_lines
  for select to authenticated
  using (current_role_of(auth.uid()) = any (array['admin'::user_role, 'staff'::user_role]));

create policy sync_state_read on public.sync_state
  for select to authenticated
  using (current_role_of(auth.uid()) = any (array['admin'::user_role, 'staff'::user_role]));
