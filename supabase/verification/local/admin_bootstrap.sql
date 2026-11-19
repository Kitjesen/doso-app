\set ON_ERROR_STOP on
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
create function auth.jwt() returns jsonb language sql stable set search_path='' as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
create function auth.uid() returns uuid language sql stable set search_path='' as $$ select (auth.jwt()->>'sub')::uuid; $$;
\ir ../../migrations/20260822185808_create_doso_accounts_and_devices.sql
\ir ../../migrations/20260822185822_grant_service_role_access.sql
\ir ../../migrations/20260822185835_add_account_terminal_security.sql
insert into auth.users(id,email) values('99999999-9999-4999-8999-999999999999','bootstrap@local.test');
