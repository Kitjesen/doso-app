\set ON_ERROR_STOP on
do $$
declare
  v_signature text;
  v_role text;
  v_function regprocedure;
begin
  if current_database() <> 'postgres' or current_user <> 'postgres' then
    raise exception 'device_admin_postflight_requires_postgres_role';
  end if;
  foreach v_signature in array array[
      'public.claim_device_with_digest(uuid,text,text)',
      'public.claim_device_with_digest(uuid,uuid,text)',
      'public.create_device_inventory(uuid,text,text,text,text,text,text,text)',
      'public.admin_rotate_device_claim(uuid,uuid,text,timestamptz,text,text)',
      'public.admin_unbind_device(uuid,uuid,text,text)',
      'public.admin_issue_factory_claim(uuid,uuid,text,timestamptz,text,text)'] loop
    v_function := to_regprocedure(v_signature);
    if v_function is null or not exists (
        select 1 from pg_catalog.pg_proc where oid=v_function and prosecdef
          and proowner='postgres'::regrole and 'search_path=""'=any(proconfig)) then
      raise exception 'device_admin_postflight_requires_safe_function %', v_signature;
    end if;
    if exists (select 1 from pg_catalog.pg_proc p,
        lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where p.oid=v_function and acl.grantee=0 and acl.privilege_type='EXECUTE') then
      raise exception 'device_admin_postflight_public_execute %', v_signature;
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,v_function,'execute') <> (v_role='service_role') then
        raise exception 'device_admin_postflight_service_privileges % %', v_signature,v_role;
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_catalog.pg_proc
      where oid=to_regprocedure('private.require_device_admin(uuid)')
        and not prosecdef and proowner='postgres'::regrole and 'search_path=""'=any(proconfig)) then
    raise exception 'device_admin_postflight_requires_admin_guard';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role,'private.require_device_admin(uuid)','execute') then
      raise exception 'device_admin_postflight_private_guard_privileges %',v_role;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_proc p,
      lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.oid=to_regprocedure('private.require_device_admin(uuid)')
        and acl.grantee=0 and acl.privilege_type='EXECUTE') then
    raise exception 'device_admin_postflight_private_guard_public_execute';
  end if;
end;
$$;
\echo PASS device_admin_readonly_postflight
