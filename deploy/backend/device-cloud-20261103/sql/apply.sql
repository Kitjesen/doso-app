\set ON_ERROR_STOP on
-- psql -X -f apply.sql. Backup belongs to the release procedure.
-- One-time baseline only. A rolled-back failure can be retried. After an
-- uncertain COMMIT, run postflight.sql read-only before deciding the next step.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare v_function text;
begin
  if current_database() <> 'postgres' or current_user <> 'postgres' then
    raise exception 'device_cloud_requires_postgres_role';
  end if;
  if (select count(*) from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role')) <> 3 then
    raise exception 'device_cloud_requires_supabase_roles';
  end if;
  if to_regclass('public.devices') is null or to_regclass('private.device_claims') is null
     or to_regclass('auth.users') is null or to_regclass('auth.sessions') is null
     or to_regclass('public.account_terminals') is null
     or to_regprocedure('private.is_account_active_for(uuid)') is null
     or to_regprocedure('private.is_account_active()') is null
     or to_regprocedure('private.is_session_active()') is null
     or to_regprocedure('private.is_current_auth_session_present()') is null
     or to_regprocedure('public.claim_device_with_digest(uuid,text,text)') is null
     or to_regprocedure('public.unbind_device(uuid,uuid,boolean)') is null then
    raise exception 'device_cloud_missing_binding_or_session_dependencies';
  end if;
  foreach v_function in array array['public.claim_device_with_digest(uuid,text,text)',
      'public.unbind_device(uuid,uuid,boolean)','private.is_account_active_for(uuid)',
      'private.is_account_active()','private.is_session_active()','private.is_current_auth_session_present()'] loop
    if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(v_function)
        and prosecdef and proowner='postgres'::regrole) then
      raise exception 'device_cloud_requires_postgres_security_definer %',v_function;
    end if;
  end loop;
end;
$$;

lock table public.devices in access exclusive mode;
do $$
begin
  if exists(select 1 from pg_catalog.pg_attribute where attrelid='public.devices'::regclass
      and attname='robot_authorization_epoch' and not attisdropped)
     or to_regclass('private.device_remote_state') is not null
     or to_regprocedure('private.enforce_device_authorization_epoch()') is not null
     or to_regprocedure('private.reset_remote_state_owner()') is not null
     or to_regprocedure('public.get_remote_state(uuid)') is not null
     or to_regprocedure('public.set_remote_state(uuid,boolean,bigint)') is not null
     or to_regprocedure('public.sync_remote_state(timestamptz,jsonb)') is not null then
    raise exception 'device_cloud_baseline_changed_run_readonly_postflight';
  end if;
  if not exists(select 1 from pg_catalog.pg_index
      where indexrelid=to_regclass('public.devices_one_physical_per_owner_idx')
        and indrelid='public.devices'::regclass and indisunique and indisvalid) then
    raise exception 'device_cloud_requires_existing_single_owner_index';
  end if;
end;
$$;

\ir 20261103140000_add_device_authorization_epoch.sql
\ir 20261103150000_add_remote_state.sql
\ir 20261103170000_allow_multiple_owned_devices.sql
\ir postflight.sql
commit;
\echo PASS device_cloud_transaction_committed
