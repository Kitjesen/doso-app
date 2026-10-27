\set ON_ERROR_STOP on

-- Synthetic PostgreSQL 17 fixture for the profile-avatar database race only.
--
-- This is deliberately not a Supabase stack substitute. It stubs only:
--   * auth.uid() from the request.jwt.claims session GUC (no JWT validation),
--   * active account/session checks as true,
--   * storage.foldername(text),
--   * the minimum profiles, buckets, objects, and audit_logs relations.
-- It does not exercise Auth, the Storage API, object bytes, S3, Realtime, or a
-- hosted Supabase project. The product migration is loaded unmodified via \ir.

do $fixture_database_guard$
begin
  if pg_catalog.current_database() <> 'doso_avatar_race_fixture' then
    raise exception using
      errcode = '55000',
      message = 'profile_avatar_concurrency_fixture_requires_database_doso_avatar_race_fixture';
  end if;
end;
$fixture_database_guard$;

do $fixture_roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end;
$fixture_roles$;

create schema auth;
create schema private;
create schema storage;

create function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select (
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create function private.is_account_active()
returns boolean
language sql
stable
set search_path = ''
as $$ select true $$;

create function private.is_session_active()
returns boolean
language sql
stable
set search_path = ''
as $$ select true $$;

create function storage.foldername(p_name text)
returns text[]
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when pg_catalog.array_length(parts, 1) > 1
      then parts[1:pg_catalog.array_length(parts, 1) - 1]
    else array[]::text[]
  end
  from (select pg_catalog.string_to_array(p_name, '/') as parts) as split_name
$$;

create type public.username_provenance as enum (
  'registration',
  'manual_claim',
  'admin_verified',
  'legacy_inferred',
  'social_provisional'
);

create table public.profiles (
  id uuid primary key,
  email text not null,
  username text not null unique,
  username_claimed_at timestamptz,
  username_provenance public.username_provenance not null,
  display_name text not null,
  avatar_url text,
  constraint profiles_username_provenance_claim_check check (
    (
      username_provenance in ('registration', 'manual_claim', 'admin_verified')
      and username_claimed_at is not null
    )
    or
    (
      username_provenance in ('legacy_inferred', 'social_provisional')
      and username_claimed_at is null
    )
  )
);

create function private.enforce_username_provenance_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  return new;
end;
$$;

-- This pre-existing trigger is part of the production migration's dependency
-- surface. The \ir migration replaces its function body without replacing the
-- trigger itself.
create trigger profiles_enforce_username_provenance_transition
before update of username, username_claimed_at, username_provenance on public.profiles
for each row execute function private.enforce_username_provenance_transition();

alter table public.profiles enable row level security;
create policy fixture_profile_owner_select
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  target_user_id uuid,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb
);

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  bucket_id text not null,
  name text not null,
  primary key (bucket_id, name)
);
alter table storage.objects enable row level security;

grant usage on schema auth, private, storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function private.is_account_active() to authenticated;
grant execute on function private.is_session_active() to authenticated;
grant execute on function storage.foldername(text) to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on storage.objects to authenticated;

-- The profile and candidate object predate the candidate migration. Seeding
-- before \ir also avoids conflating this race with its upload quota trigger.
insert into public.profiles (
  id, email, username, username_claimed_at, username_provenance,
  display_name, avatar_url
) values (
  '91000000-0000-4000-8000-000000000001',
  'avatar-race@fixture.invalid',
  'fixture_owner',
  pg_catalog.clock_timestamp(),
  'registration',
  'Fixture Owner',
  null
);

insert into storage.objects (bucket_id, name) values (
  'profile-avatars',
  '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001.png'
);

-- Load the product candidate exactly as committed. Do not copy or edit its SQL
-- into this fixture: the harness must exercise the real policy and RPC body.
\ir ../../migrations/20261012090000_add_profile_editing.sql

\echo 'profile_avatar_concurrency_fixture_ready'

-- Exact deterministic baseline protocol (run once at READ COMMITTED and again
-- at REPEATABLE READ). The harness owns process/session orchestration.
--
-- Constants:
--   U = 91000000-0000-4000-8000-000000000001
--   C = 91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001.png
--   P = profile-avatars/U/94000000-0000-4000-8000-000000000001.png
--
-- Before EACH isolation case, run as the fixture database owner:
--
--   begin;
--   select pg_catalog.set_config(
--     'request.jwt.claims',
--     '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000001"}',
--     true
--   );
--   update public.profiles
--   set avatar_url = null,
--       avatar_managed_by_user = true
--   where id = '91000000-0000-4000-8000-000000000001';
--   insert into storage.objects (bucket_id, name)
--   values (
--     'profile-avatars',
--     '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001.png'
--   ) on conflict (bucket_id, name) do nothing;
--   commit;
--
-- SESSION A (database owner; the DELETE itself runs as authenticated through
-- the real storage.objects RLS policy):
--
--   set application_name = 'doso-avatar-race-A';
--   begin;
--   set local statement_timeout = '12s';
--   set local lock_timeout = '10s';
--   select id from public.profiles
--   where id = '91000000-0000-4000-8000-000000000001'
--   for update;
--   set local role authenticated;
--   select pg_catalog.set_config(
--     'request.jwt.claims',
--     '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000001"}',
--     true
--   );
--   delete from storage.objects
--   where bucket_id = 'profile-avatars'
--     and name = '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001.png'
--   returning bucket_id, name;
--   -- Hold this transaction open until the observer proves B is blocked.
--
-- SESSION B, READ COMMITTED case (submit the SELECT asynchronously):
--
--   set application_name = 'doso-avatar-race-B-RC';
--   begin isolation level read committed;
--   set local statement_timeout = '12s';
--   set local lock_timeout = '10s';
--   set local role authenticated;
--   select pg_catalog.set_config(
--     'request.jwt.claims',
--     '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000001"}',
--     true
--   );
--   select avatar_url
--   from public.update_my_profile(
--     '91000000-0000-4000-8000-000000000001',
--     'fixture_owner',
--     'Fixture Owner',
--     'replace',
--     'profile-avatars/91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001.png'
--   );
--   commit;
--
-- SESSION B, REPEATABLE READ case is identical except for:
--
--   set application_name = 'doso-avatar-race-B-RR';
--   begin isolation level repeatable read;
--
-- OBSERVER (database owner): poll this query until blocking_pids contains A's
-- PID. This lock evidence, not elapsed time, is the synchronization barrier:
--
--   select
--     b.pid as blocked_pid,
--     b.wait_event_type,
--     b.wait_event,
--     pg_catalog.pg_blocking_pids(b.pid) as blocking_pids
--   from pg_catalog.pg_stat_activity as b
--   where b.application_name in ('doso-avatar-race-B-RC', 'doso-avatar-race-B-RR')
--     and b.wait_event_type = 'Lock';
--
-- Once the observer proves B is blocked, COMMIT session A. Then allow B's RPC
-- and COMMIT to finish. Finally run as the fixture database owner:
--
--   select
--     p.avatar_url,
--     exists (
--       select 1 from storage.objects as o
--       where o.bucket_id = 'profile-avatars'
--         and o.name = '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001.png'
--     ) as object_exists,
--     (
--       p.avatar_url = 'profile-avatars/91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001.png'
--       and not exists (
--         select 1 from storage.objects as o
--         where o.bucket_id = 'profile-avatars'
--           and o.name = '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000001.png'
--       )
--     ) as dangling_avatar_reproduced
--   from public.profiles as p
--   where p.id = '91000000-0000-4000-8000-000000000001';
--
-- Expected baseline for both RC and RR: object_exists = false and
-- dangling_avatar_reproduced = true. That proves only the database/RLS race;
-- it does not prove Storage API deletion ordering or object-byte behavior.
