\set ON_ERROR_STOP on

do $guard$
begin
  if current_database() <> 'doso_avatar_race_fixture' then
    raise exception 'auth_session_authority_fixture_wrong_database';
  end if;
end;
$guard$;

create table auth.users (
  id uuid primary key,
  email text
);

create schema extensions;
create extension pgcrypto with schema extensions;

create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

alter table public.profiles
  add column account_status text not null default 'active'
    constraint profiles_account_status_check check (account_status in ('active', 'suspended', 'deleting'));

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

revoke all on function private.current_session_id() from public, anon, authenticated;
revoke all on function private.is_account_active() from public, anon, authenticated;
revoke all on function private.is_session_active() from public, anon, authenticated;
grant usage on schema auth, private to authenticated, service_role;
grant execute on function auth.uid() to authenticated;
grant execute on function auth.jwt() to authenticated;
grant execute on function private.current_session_id() to authenticated, service_role;
grant execute on function private.is_account_active() to authenticated, service_role;
grant execute on function private.is_session_active() to authenticated, service_role;

drop policy if exists fixture_profile_owner_select on public.profiles;
drop policy if exists "profiles_select_active_own" on public.profiles;
create policy "profiles_select_active_own"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
);

insert into auth.users(id) values ('91000000-0000-4000-8000-000000000001');

\echo 'auth_session_authority_fixture_ready'
