\set ON_ERROR_STOP on
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_database()<>'postgres' or current_user<>'postgres'
     or to_regprocedure('private.remote_received(jsonb,uuid)') is null
     or to_regprocedure('private.remote_sample_dto(jsonb)') is null
     or to_regclass('private.video_grants') is null
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='devices' and column_name='is_simulated') then
    raise exception 'device_location_requires_simulated_device_baseline';
  end if;
end $$;
\ir 20261108010000_add_remote_location.sql
\ir postflight.sql
commit;
\echo PASS device_location_transaction_committed
