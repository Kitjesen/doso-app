\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
begin
  if current_database() <> 'postgres' or current_user <> 'postgres' then
    raise exception 'video_access_requires_postgres_role';
  end if;
  if to_regprocedure('public.create_device_inventory(uuid,text,text,text,text,text,text,text)') is null
     or to_regprocedure('private.current_session_id()') is null
     or to_regprocedure('private.is_account_active()') is null
     or to_regprocedure('private.is_session_active()') is null
     or to_regprocedure('private.is_account_active_for(uuid)') is null
     or to_regclass('auth.sessions') is null
     or to_regclass('public.account_terminals') is null
     or not exists(select 1 from information_schema.columns where table_schema='public'
       and table_name='devices' and column_name='robot_authorization_epoch') then
    raise exception 'video_access_requires_device_admin_schema';
  end if;
end;
$$;
lock table public.devices in share row exclusive mode;
do $$
begin
  if to_regclass('private.video_grants') is not null
     or to_regprocedure('public.open_video_access(uuid,text)') is not null
     or to_regprocedure('public.close_video_access(uuid)') is not null
     or to_regprocedure('public.authorize_video_access(text)') is not null then
    raise exception 'video_access_baseline_changed_run_readonly_postflight';
  end if;
end;
$$;
\ir 20261105110000_add_video_grants.sql
\ir postflight.sql
commit;
\echo PASS video_access_transaction_committed
