\set ON_ERROR_STOP on
-- Read-only assertions. Also executed inside apply.sql before COMMIT.
do $$
declare
  v_role text;
  v_function regprocedure;
  v_dependency text;
begin
  if current_database() <> 'postgres' or current_user <> 'postgres' then
    raise exception 'device_cloud_postflight_requires_postgres_role';
  end if;
  if to_regclass('private.device_remote_state') is null
     or to_regclass('public.devices_one_physical_per_owner_idx') is not null
     or not exists(select 1 from information_schema.columns where table_schema='public'
       and table_name='devices' and column_name='robot_authorization_epoch'
       and data_type='bigint' and is_nullable='NO' and column_default='1') then
    raise exception 'device_cloud_schema_postflight_failed';
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.devices'::regclass
      and contype='c' and convalidated and pg_get_expr(conbin,conrelid)='(robot_authorization_epoch >= 1)') then
    raise exception 'device_cloud_epoch_constraint_postflight_failed';
  end if;
  if (select count(*) from pg_catalog.pg_trigger where tgrelid='public.devices'::regclass
       and tgname in ('devices_enforce_authorization_epoch','devices_enforce_robot_update')
       and not tgisinternal) <> 1
     or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.devices'::regclass
       and tgname='devices_enforce_authorization_epoch' and tgenabled in ('O','A')
       and tgfoid=to_regprocedure('private.enforce_device_authorization_epoch()') and tgtype=19)
     or not exists(select 1 from pg_catalog.pg_proc
       where oid=to_regprocedure('private.enforce_device_authorization_epoch()') and not prosecdef) then
    raise exception 'device_cloud_epoch_authority_postflight_failed';
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.devices'::regclass
      and tgname='device_remote_state_owner' and tgenabled in ('O','A') and tgtype=21
      and tgfoid=to_regprocedure('private.reset_remote_state_owner()')) then
    raise exception 'device_cloud_remote_reset_postflight_failed';
  end if;
  if to_regprocedure('public.claim_device_with_digest(uuid,text,text)') is null
     or to_regprocedure('public.get_remote_state(uuid)') is null
     or to_regprocedure('public.set_remote_state(uuid,boolean,bigint)') is null
     or to_regprocedure('public.sync_remote_state(timestamptz,jsonb)') is null then
    raise exception 'device_cloud_rpc_postflight_failed';
  end if;
  foreach v_dependency in array array['public.claim_device_with_digest(uuid,text,text)',
      'public.unbind_device(uuid,uuid,boolean)','private.is_account_active_for(uuid)',
      'private.is_account_active()','private.is_session_active()','private.is_current_auth_session_present()',
      'public.get_remote_state(uuid)','public.set_remote_state(uuid,boolean,bigint)',
      'public.sync_remote_state(timestamptz,jsonb)','private.reset_remote_state_owner()'] loop
    if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(v_dependency)
        and prosecdef and proowner='postgres'::regrole) then
      raise exception 'device_cloud_postflight_requires_postgres_security_definer %',v_dependency;
    end if;
  end loop;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role,'private.enforce_device_authorization_epoch()','execute')
       or has_function_privilege(v_role,'private.reset_remote_state_owner()','execute')
       or has_table_privilege(v_role,'private.device_remote_state','select,insert,update,delete') then
      raise exception 'device_cloud_private_privileges_postflight_failed %',v_role;
    end if;
    foreach v_function in array array['public.get_remote_state(uuid)'::regprocedure,
        'public.set_remote_state(uuid,boolean,bigint)'::regprocedure] loop
      if has_function_privilege(v_role,v_function,'execute') <> (v_role='authenticated') then
        raise exception 'device_cloud_user_rpc_privileges_postflight_failed %',v_role;
      end if;
    end loop;
    if has_function_privilege(v_role,'public.sync_remote_state(timestamptz,jsonb)','execute') <> (v_role='service_role')
       or has_function_privilege(v_role,'public.claim_device_with_digest(uuid,text,text)','execute') <> (v_role='service_role') then
      raise exception 'device_cloud_service_rpc_privileges_postflight_failed %',v_role;
    end if;
  end loop;
end;
$$;
select current_database() as database,current_user as execution_role,
  (select count(*) from public.devices) as device_count;
\echo PASS device_cloud_readonly_postflight
