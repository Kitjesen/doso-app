alter table public.profiles
  add column app_role text not null default 'user'
    constraint profiles_app_role_check check (app_role in ('user', 'support', 'admin')),
  add column account_status text not null default 'active'
    constraint profiles_account_status_check check (account_status in ('active', 'suspended', 'deleting')),
  add column suspended_at timestamptz,
  add column suspension_reason text;

alter table public.devices alter column owner_id drop not null;

create table public.account_terminals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid not null unique,
  installation_id text not null check (length(btrim(installation_id)) between 1 and 200),
  platform text not null check (platform in ('android', 'ios', 'web', 'windows', 'macos', 'linux', 'unknown')),
  device_label text not null check (length(btrim(device_label)) between 1 and 200),
  app_version text,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text
);

create index account_terminals_user_id_idx
  on public.account_terminals(user_id, last_seen_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  target_user_id uuid,
  action text not null check (length(btrim(action)) between 1 and 160),
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_idx on public.audit_logs(actor_user_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs(target_user_id, created_at desc);

create table private.device_claims (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null unique references public.devices(id) on delete cascade,
  code_digest text not null check (length(code_digest) between 32 and 512),
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 100),
  consumed_by uuid references auth.users(id) on delete set null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function private.current_session_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  value text;
begin
  value := auth.jwt() ->> 'session_id';
  if value is null or value = '' then
    return null;
  end if;
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.profiles
      where id = auth.uid() and account_status = 'active'
    ),
    false
  );
$$;

create or replace function private.is_account_active_for(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.profiles
      where id = p_user_id and account_status = 'active'
    ),
    false
  );
$$;

create or replace function private.is_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.account_terminals
      where user_id = auth.uid()
        and auth_session_id = private.current_session_id()
        and revoked_at is null
    ),
    false
  );
$$;

alter table public.account_terminals enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "devices_select_own" on public.devices;
drop policy if exists "devices_insert_own" on public.devices;
drop policy if exists "devices_update_own" on public.devices;
drop policy if exists "devices_delete_own" on public.devices;

create policy "profiles_select_active_own"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "profiles_update_active_own"
on public.profiles for update to authenticated
using (
  id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
)
with check (
  id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "devices_select_active_own"
on public.devices for select to authenticated
using (
  owner_id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "devices_insert_safe_demo"
on public.devices for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and is_demo
  and serial_number is null
  and connection_status = 'offline'
  and safety_lock
  and battery_percent is null
  and firmware_version is null
  and runtime_hours = 0
  and last_seen_at is null
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "devices_update_preferences"
on public.devices for update to authenticated
using (
  owner_id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
)
with check (
  owner_id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "devices_delete_own_demo"
on public.devices for delete to authenticated
using (
  owner_id = (select auth.uid())
  and is_demo
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "account_terminals_select_active_own"
on public.account_terminals for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "audit_logs_select_related"
on public.audit_logs for select to authenticated
using (
  (actor_user_id = (select auth.uid()) or target_user_id = (select auth.uid()))
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create or replace function public.register_account_terminal(
  p_installation_id text,
  p_platform text,
  p_device_label text,
  p_app_version text,
  p_user_agent text default null
)
returns public.account_terminals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := private.current_session_id();
  result public.account_terminals;
begin
  if v_user_id is null or v_session_id is null then
    raise exception 'authenticated session is required';
  end if;
  if not private.is_account_active() then
    raise exception 'account is not active';
  end if;
  if p_installation_id is null or btrim(p_installation_id) = ''
     or p_device_label is null or btrim(p_device_label) = '' then
    raise exception 'installation id and device label are required';
  end if;

  insert into public.account_terminals (
    user_id, auth_session_id, installation_id, platform, device_label, app_version, user_agent
  )
  values (
    v_user_id, v_session_id, p_installation_id, lower(p_platform), p_device_label, p_app_version, p_user_agent
  )
  on conflict (auth_session_id) do update
  set installation_id = excluded.installation_id,
      platform = excluded.platform,
      device_label = excluded.device_label,
      app_version = excluded.app_version,
      user_agent = excluded.user_agent,
      last_seen_at = now()
  where account_terminals.user_id = excluded.user_id
    and account_terminals.revoked_at is null
  returning * into result;

  if result.id is null then
    raise exception 'current session has been revoked';
  end if;
  return result;
end;
$$;

create or replace function public.heartbeat_current_terminal()
returns public.account_terminals
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.account_terminals;
begin
  if not private.is_account_active() or not private.is_session_active() then
    raise exception 'current session is not active';
  end if;

  update public.account_terminals
  set last_seen_at = now()
  where user_id = auth.uid()
    and auth_session_id = private.current_session_id()
    and revoked_at is null
  returning * into result;
  return result;
end;
$$;

create or replace function public.revoke_account_terminal(
  p_terminal_id uuid,
  p_reason text default 'user_request'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  if not private.is_account_active() or not private.is_session_active() then
    raise exception 'current session is not active';
  end if;
  update public.account_terminals
  set revoked_at = now(), revocation_reason = left(coalesce(p_reason, 'user_request'), 200)
  where id = p_terminal_id and user_id = auth.uid() and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.revoke_current_terminal(p_reason text default 'user_request')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  if not private.is_account_active() or not private.is_session_active() then
    raise exception 'current session is not active';
  end if;
  update public.account_terminals
  set revoked_at = now(), revocation_reason = left(coalesce(p_reason, 'user_request'), 200)
  where user_id = auth.uid() and auth_session_id = private.current_session_id() and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.revoke_other_terminals(p_reason text default 'user_request')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  if not private.is_account_active() or not private.is_session_active() then
    raise exception 'current session is not active';
  end if;
  update public.account_terminals
  set revoked_at = now(), revocation_reason = left(coalesce(p_reason, 'user_request'), 200)
  where user_id = auth.uid()
    and auth_session_id <> private.current_session_id()
    and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.revoke_all_terminals(p_reason text default 'user_request')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  if not private.is_account_active() or not private.is_session_active() then
    raise exception 'current session is not active';
  end if;
  update public.account_terminals
  set revoked_at = now(), revocation_reason = left(coalesce(p_reason, 'user_request'), 200)
  where user_id = auth.uid() and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.admin_revoke_user_terminals(
  p_user_id uuid,
  p_reason text default 'admin_global_signout'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  update public.account_terminals
  set revoked_at = now(), revocation_reason = left(coalesce(p_reason, 'admin_global_signout'), 200)
  where user_id = p_user_id and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.rotate_device_claim(
  p_device_id uuid,
  p_code_digest text,
  p_expires_at timestamptz
)
returns private.device_claims
language sql
security definer
set search_path = ''
as $$
  insert into private.device_claims (device_id, code_digest, expires_at)
  values (p_device_id, p_code_digest, p_expires_at)
  on conflict (device_id) do update
  set code_digest = excluded.code_digest,
      expires_at = excluded.expires_at,
      attempt_count = 0,
      consumed_by = null,
      consumed_at = null,
      created_at = now()
  returning *;
$$;

create or replace function public.claim_device_with_digest(
  p_user_id uuid,
  p_serial_number text,
  p_code_digest text
)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices;
  v_claim private.device_claims;
begin
  if not private.is_account_active_for(p_user_id) then
    raise exception 'account is not active';
  end if;
  select * into v_device from public.devices
  where serial_number = p_serial_number and not is_demo
  for update;
  if v_device.id is null or (v_device.owner_id is not null and v_device.owner_id <> p_user_id) then
    return null;
  end if;
  select * into v_claim from private.device_claims where device_id = v_device.id for update;
  if v_claim.id is null or v_claim.consumed_at is not null or v_claim.expires_at <= now()
     or v_claim.attempt_count >= v_claim.max_attempts or v_claim.code_digest <> p_code_digest then
    if v_claim.id is not null and v_claim.consumed_at is null then
      update private.device_claims set attempt_count = attempt_count + 1 where id = v_claim.id;
    end if;
    return null;
  end if;
  update public.devices set owner_id = p_user_id where id = v_device.id returning * into v_device;
  update private.device_claims set consumed_by = p_user_id, consumed_at = now() where id = v_claim.id;
  return v_device;
end;
$$;

create or replace function public.unbind_device(
  p_device_id uuid,
  p_owner_id uuid default null,
  p_force boolean default false
)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare result public.devices;
begin
  update public.devices
  set owner_id = null,
      connection_status = 'offline',
      safety_lock = true,
      battery_percent = null,
      runtime_hours = 0,
      last_seen_at = null
  where id = p_device_id
    and not is_demo
    and (p_force or p_owner_id is null or owner_id = p_owner_id)
  returning * into result;
  return result;
end;
$$;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.devices from anon, authenticated;
revoke all on table public.account_terminals from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table private.device_claims from public, anon, authenticated;

grant select, update (display_name, avatar_url) on table public.profiles to authenticated;
grant select, insert, delete, update (display_name, alerts_enabled) on table public.devices to authenticated;
grant select on table public.account_terminals to authenticated;
grant select on table public.audit_logs to authenticated;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.devices to service_role;
grant select, insert, update, delete on table public.account_terminals to service_role;
grant select, insert on table public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;
grant usage on schema private to authenticated, service_role;
grant select, insert, update, delete on table private.device_claims to service_role;

revoke all on function private.current_session_id() from public, anon, authenticated;
revoke all on function private.is_account_active() from public, anon, authenticated;
revoke all on function private.is_account_active_for(uuid) from public, anon, authenticated;
revoke all on function private.is_session_active() from public, anon, authenticated;
grant execute on function private.current_session_id() to authenticated, service_role;
grant execute on function private.is_account_active() to authenticated, service_role;
grant execute on function private.is_account_active_for(uuid) to service_role;
grant execute on function private.is_session_active() to authenticated, service_role;

revoke all on function public.register_account_terminal(text, text, text, text, text) from public, anon;
revoke all on function public.heartbeat_current_terminal() from public, anon;
revoke all on function public.revoke_account_terminal(uuid, text) from public, anon;
revoke all on function public.revoke_current_terminal(text) from public, anon;
revoke all on function public.revoke_other_terminals(text) from public, anon;
revoke all on function public.revoke_all_terminals(text) from public, anon;
grant execute on function public.register_account_terminal(text, text, text, text, text) to authenticated;
grant execute on function public.heartbeat_current_terminal() to authenticated;
grant execute on function public.revoke_account_terminal(uuid, text) to authenticated;
grant execute on function public.revoke_current_terminal(text) to authenticated;
grant execute on function public.revoke_other_terminals(text) to authenticated;
grant execute on function public.revoke_all_terminals(text) to authenticated;

revoke all on function public.rotate_device_claim(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_device_with_digest(uuid, text, text) from public, anon, authenticated;
revoke all on function public.unbind_device(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_revoke_user_terminals(uuid, text) from public, anon, authenticated;
grant execute on function public.rotate_device_claim(uuid, text, timestamptz) to service_role;
grant execute on function public.claim_device_with_digest(uuid, text, text) to service_role;
grant execute on function public.unbind_device(uuid, uuid, boolean) to service_role;
grant execute on function public.admin_revoke_user_terminals(uuid, text) to service_role;

comment on table public.account_terminals is 'Login terminals keyed by the immutable Supabase Auth session_id JWT claim.';
comment on table public.audit_logs is 'Append-only security and administration audit trail.';
comment on table private.device_claims is 'One-time physical device claim secrets; only digests are stored.';
