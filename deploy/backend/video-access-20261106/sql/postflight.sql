\set ON_ERROR_STOP on
do $$
declare
  signature text;
  role_name text;
  target regprocedure;
  expected_role text;
begin
  if current_database() <> 'postgres' or current_user <> 'postgres'
     or to_regclass('private.video_grants') is null then
    raise exception 'video_access_postflight_requires_target';
  end if;
  foreach signature in array array['public.open_video_access(uuid,text)',
      'public.close_video_access(uuid)','public.authorize_video_access(text)'] loop
    target := to_regprocedure(signature);
    if target is null or not exists(select 1 from pg_catalog.pg_proc where oid=target
        and prosecdef and proowner='postgres'::regrole and 'search_path=""'=any(proconfig)) then
      raise exception 'video_access_postflight_unsafe_function %',signature;
    end if;
    if exists(select 1 from pg_catalog.pg_proc p,
        lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where p.oid=target and acl.grantee=0 and acl.privilege_type='EXECUTE') then
      raise exception 'video_access_postflight_public_execute %',signature;
    end if;
    expected_role := case when signature='public.authorize_video_access(text)'
      then 'service_role' else 'authenticated' end;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(role_name,target,'execute') <> (role_name=expected_role) then
        raise exception 'video_access_postflight_bad_grant % %',signature,role_name;
      end if;
    end loop;
  end loop;
  if exists(select 1 from pg_catalog.pg_class c,
      lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
      where c.oid='private.video_grants'::regclass and (acl.grantee=0
        or acl.grantee in ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole))) then
    raise exception 'video_access_postflight_table_exposed';
  end if;
end;
$$;
\echo PASS video_access_readonly_postflight
