-- Master admin tier.
-- Masters keep role = 'admin' (so every existing role gate keeps working) and
-- additionally hold the EXCLUSIVE right to manage admin accounts: create
-- admins, grant/revoke the admin role, activate/deactivate admins, and toggle
-- is_master on others. Regular admins manage staff and vendor accounts only.
-- Run manually in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists is_master boolean not null default false;

comment on column public.profiles.is_master is
  'Master admin tier: admin + exclusive ability to manage admin accounts. Role stays ''admin'' so existing role checks keep working.';
