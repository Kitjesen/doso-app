\set ON_ERROR_STOP on

-- Synthetic runner only: deliberately start with broader function defaults.
-- These are not production changes or a hosted-Supabase configuration claim.
do $guard$
begin
  if current_database() <> 'doso_avatar_race_fixture' or current_user <> 'postgres' then
    raise exception 'auth_privileges_fixture_wrong_database_or_owner';
  end if;
end;
$guard$;

alter default privileges grant execute on functions to anon, authenticated, service_role;
create function private.fixture_default_execute_probe() returns boolean
language sql set search_path = '' as $$ select true $$;

do $default_acl_precondition$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if not has_function_privilege(role_name,'private.fixture_default_execute_probe()','EXECUTE') then
      raise exception 'default_execute_probe_missing_for_%', role_name;
    end if;
  end loop;
  if not exists (
    select 1 from pg_catalog.pg_proc p,
      lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid='private.fixture_default_execute_probe()'::regprocedure
      and a.grantee=0 and a.privilege_type='EXECUTE'
  ) then raise exception 'default_execute_probe_public_missing'; end if;
end;
$default_acl_precondition$;
drop function private.fixture_default_execute_probe();
\echo 'auth_privileges_broad_defaults_proven'
