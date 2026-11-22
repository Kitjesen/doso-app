\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_database()<>'postgres' or current_user<>'postgres'
     or to_regprocedure('private.remote_received(jsonb,uuid)') is null
     or to_regclass('private.video_grants') is null
     or to_regclass('private.telemetry_devices') is not null
     or to_regprocedure('public.get_telemetry_history_access(uuid)') is not null
     or not exists(select 1 from information_schema.columns where table_schema='public'
       and table_name='devices' and column_name='is_simulated') then
    raise exception 'remote_history_requires_device_location_baseline';
  end if;
end $$;
\ir 20261108020000_add_telemetry_export.sql
\ir 20261109010000_add_history_access.sql
\ir postflight.sql
commit;
\echo PASS remote_history_transaction_committed
