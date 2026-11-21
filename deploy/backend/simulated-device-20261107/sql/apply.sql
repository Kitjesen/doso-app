\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_database()<>'postgres' or current_user<>'postgres'
     or to_regprocedure('public.create_device_inventory(uuid,text,text,text,text,text,text,text)') is null
     or to_regclass('private.device_remote_state') is null
     or to_regclass('private.video_grants') is null then
    raise exception 'simulated_device_requires_video_access_baseline';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='devices' and column_name='is_simulated') then
    raise exception 'simulated_device_already_applied_run_postflight';
  end if;
end $$;
lock table public.devices in share row exclusive mode;
\ir 20261107100000_add_simulated_devices.sql
\ir postflight.sql
commit;
\echo PASS simulated_device_transaction_committed
