-- Registro de reportes nocturnos enviados (§3 `/send-email` del handoff).
--
-- El legado añadió esta tabla el 7 de julio de 2026 tras perder reportes por caídas del
-- Mac Mini: marca la fecha SOLO cuando el proveedor de correo aceptó el mensaje, para que
-- un día que no salió se pueda recuperar tarde en la siguiente pasada. Se conserva igual.

create table if not exists public.removal_report_log (
  local_date       date primary key,
  sent_at          timestamptz not null default now(),
  entries          integer not null default 0,
  unsigned_entries integer not null default 0,
  late             boolean not null default false
);

comment on table public.removal_report_log is
  'Un registro por día operativo enviado. La fila existe solo si Resend aceptó el correo.';
comment on column public.removal_report_log.late is
  'true = se envió fuera de hora, recuperando un día que no salió a tiempo.';

-- RLS sin policies: nadie con sesión de usuario lee ni escribe esta tabla.
-- Solo el cron, que usa la service role key (bypass de RLS) desde el servidor.
alter table public.removal_report_log enable row level security;
