\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if current_database() <> 'postgres' or current_user <> 'postgres' then
    raise exception 'device_admin_requires_postgres_role';
  end if;
  if (select count(*) from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role')) <> 3
     or to_regclass('public.devices') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.audit_logs') is null
     or to_regclass('private.device_claims') is null
     or to_regclass('private.device_remote_state') is null
     or to_regprocedure('public.claim_device_with_digest(uuid,text,text)') is null
     or to_regprocedure('public.rotate_device_claim(uuid,text,timestamptz)') is null
     or to_regprocedure('public.unbind_device(uuid,uuid,boolean)') is null
     or to_regprocedure('public.get_remote_state(uuid)') is null
     or to_regprocedure('public.sync_remote_state(timestamptz,jsonb)') is null
     or to_regclass('public.devices_one_physical_per_owner_idx') is not null then
    raise exception 'device_admin_requires_deployed_device_cloud_schema';
  end if;
end;
$$;

lock table public.devices in share row exclusive mode;
do $$
begin
  if to_regprocedure('public.claim_device_with_digest(uuid,uuid,text)') is not null
     or to_regprocedure('public.create_device_inventory(uuid,text,text,text,text,text,text,text)') is not null
     or to_regprocedure('public.admin_rotate_device_claim(uuid,uuid,text,timestamptz,text,text)') is not null
     or to_regprocedure('public.admin_unbind_device(uuid,uuid,text,text)') is not null
     or to_regprocedure('public.admin_issue_factory_claim(uuid,uuid,text,timestamptz,text,text)') is not null
     or to_regprocedure('private.require_device_admin(uuid)') is not null then
    raise exception 'device_admin_baseline_changed_run_readonly_postflight';
  end if;
end;
$$;

\ir 20261104090000_claim_device_by_uuid.sql
\ir 20261104100000_create_device_inventory.sql
\ir 20261104110000_issue_factory_claim.sql
\ir postflight.sql
commit;
\echo PASS device_admin_transaction_committed
