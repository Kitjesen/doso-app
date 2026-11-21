\set ON_ERROR_STOP on
do $$
declare signature text; role_name text; target regprocedure; expected_role text;
begin
  if current_database()<>'postgres' or current_user<>'postgres'
     or to_regclass('private.telemetry_devices') is null or to_regclass('private.telemetry_outbox') is null then
    raise exception 'remote_history_postflight_requires_target';
  end if;
  foreach signature in array array['public.configure_telemetry_export(uuid,boolean)',
    'public.claim_telemetry_export()','public.check_telemetry_export(uuid,uuid,uuid)',
    'public.finish_telemetry_export(uuid,uuid,text)','public.get_telemetry_history_access(uuid)'] loop
    target := to_regprocedure(signature);
    if target is null or not exists(select 1 from pg_catalog.pg_proc where oid=target
        and prosecdef and proowner='postgres'::regrole and 'search_path=""'=any(proconfig)) then
      raise exception 'remote_history_unsafe_function %',signature;
    end if;
    if exists(select 1 from pg_catalog.pg_proc p,
        lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where p.oid=target and acl.grantee=0 and acl.privilege_type='EXECUTE') then
      raise exception 'remote_history_public_execute %',signature;
    end if;
    expected_role := case when signature='public.get_telemetry_history_access(uuid)' then 'authenticated' else 'service_role' end;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,target,'execute') <> (role_name=expected_role) then
        raise exception 'remote_history_bad_grant % %',signature,role_name;
      end if;
    end loop;
  end loop;
  if exists(select 1 from pg_catalog.pg_class c,
      lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
      where c.oid in ('private.telemetry_devices'::regclass,'private.telemetry_outbox'::regclass)
        and (acl.grantee=0 or acl.grantee in ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole))) then
    raise exception 'remote_history_table_exposed';
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='private.device_remote_state'::regclass
    and tgname='remote_state_telemetry' and tgenabled='O'
    and tgfoid='private.enqueue_telemetry()'::regprocedure) then
    raise exception 'remote_history_enqueue_trigger_missing';
  end if;
end;
$$;
\echo PASS remote_history_readonly_postflight
