\set ON_ERROR_STOP on

-- Three functions only. This is not the full cross-domain or Supabase suite.
do $catalog_matrix$
declare target record; role_name text; expected boolean; actual boolean;
begin
  if current_database() <> 'doso_avatar_race_fixture' or current_user <> 'postgres' then
    raise exception 'auth_privileges_test_wrong_database_or_owner';
  end if;
  if (select count(*) from pg_catalog.pg_roles
      where rolname in ('anon','authenticated','service_role')) <> 3
    or exists (select 1 from pg_catalog.pg_roles
      where rolname in ('anon','authenticated','service_role')
        and (rolsuper or rolbypassrls or rolcanlogin))
    or exists (select 1 from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.member
      where r.rolname in ('anon','authenticated','service_role')) then
    raise exception 'auth_privileges_fixture_role_precondition_invalid';
  end if;
  for target in select * from (values
    ('private.is_current_auth_session_present()',false,false),
    ('private.is_session_active()',true,true),
    ('public.register_account_terminal(text,text,text,text,text)',true,false)
  ) as targets(signature,authenticated_allowed,service_allowed) loop
    if not exists (select 1 from pg_catalog.pg_proc p
        where p.oid=target.signature::regprocedure and p.prosecdef
          and p.proconfig @> array['search_path=""']::text[]
          and pg_catalog.pg_get_userbyid(p.proowner)='postgres') then
      raise exception 'auth_privileges_security_definition_invalid_%', target.signature;
    end if;
    if exists (
      select 1 from pg_catalog.pg_proc p,
        lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      where p.oid=target.signature::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'
    ) then raise exception 'auth_privileges_public_execute_leaked_%', target.signature; end if;
    foreach role_name in array array['anon','authenticated','service_role'] loop
      expected := case role_name when 'authenticated' then target.authenticated_allowed
        when 'service_role' then target.service_allowed else false end;
      actual := has_function_privilege(role_name,target.signature,'EXECUTE');
      if actual is distinct from expected then
        raise exception 'auth_privileges_matrix_mismatch_%_%',role_name,target.signature;
      end if;
    end loop;
  end loop;
end;
$catalog_matrix$;
\echo 'auth_privileges_catalog_12_cells_pass'

create temp table auth_privileges_rows_before as select
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)
    from public.account_terminals t) as terminals,
  (select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)
    from public.account_email_outbox o) as outbox,
  (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)
    from public.audit_logs a) as audits;

begin;
-- Temporary fixture capability; ROLLBACK restores actual schema grants.
grant usage on schema private to anon;
set local role anon;
do $anon_calls$
begin
  if current_user <> 'anon' or not has_schema_privilege(current_user,'private','USAGE') then
    raise exception 'anon_call_precondition_invalid';
  end if;
  begin
    perform private.is_current_auth_session_present();
    raise exception 'anon_helper_accepted';
  exception when sqlstate '42501' then
    if sqlerrm <> 'permission denied for function is_current_auth_session_present' then raise; end if;
  end;
  begin
    perform private.is_session_active();
    raise exception 'anon_gate_accepted';
  exception when sqlstate '42501' then
    if sqlerrm <> 'permission denied for function is_session_active' then raise; end if;
  end;
  begin
    perform public.register_account_terminal('acl-anon','android','ACL anon','1.0','Synthetic');
    raise exception 'anon_registration_accepted';
  exception when sqlstate '42501' then
    if sqlerrm <> 'permission denied for function register_account_terminal' then raise; end if;
  end;
end;
$anon_calls$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000002"}',true);
do $authenticated_calls$
declare terminal public.account_terminals;
begin
  if current_user <> 'authenticated' then raise exception 'authenticated_call_role_invalid'; end if;
  begin
    perform private.is_current_auth_session_present();
    raise exception 'authenticated_helper_accepted';
  exception when sqlstate '42501' then
    if sqlerrm <> 'permission denied for function is_current_auth_session_present' then raise; end if;
  end;
  if private.is_session_active() is distinct from true then raise exception 'authenticated_gate_rejected'; end if;
  terminal := public.register_account_terminal('acl-authenticated','android','ACL authenticated','1.0','Synthetic');
  if terminal.user_id is distinct from '91000000-0000-4000-8000-000000000001'::uuid
    or terminal.auth_session_id is distinct from '93000000-0000-4000-8000-000000000002'::uuid
    or terminal.device_label is distinct from 'ACL authenticated' then
    raise exception 'authenticated_registration_result_invalid';
  end if;
end;
$authenticated_calls$;
rollback;

begin;
set local role service_role;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"service_role","session_id":"93000000-0000-4000-8000-000000000002"}',true);
do $service_calls$
begin
  if current_user <> 'service_role' then raise exception 'service_call_role_invalid'; end if;
  begin
    perform private.is_current_auth_session_present();
    raise exception 'service_helper_accepted';
  exception when sqlstate '42501' then
    if sqlerrm <> 'permission denied for function is_current_auth_session_present' then raise; end if;
  end;
  if private.is_session_active() is distinct from true then raise exception 'service_gate_rejected'; end if;
  begin
    perform public.register_account_terminal('acl-service','android','ACL service','1.0','Synthetic');
    raise exception 'service_registration_accepted';
  exception when sqlstate '42501' then
    if sqlerrm <> 'permission denied for function register_account_terminal' then raise; end if;
  end;
end;
$service_calls$;
rollback;

do $no_durable_row_changes$
begin
  if current_user <> 'postgres' then raise exception 'auth_privileges_owner_not_restored'; end if;
  if has_schema_privilege('anon','private','USAGE') then
    raise exception 'auth_privileges_temporary_schema_grant_persisted';
  end if;
  if (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)
      from public.account_terminals t) is distinct from (select terminals from auth_privileges_rows_before)
    or (select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)
      from public.account_email_outbox o) is distinct from (select outbox from auth_privileges_rows_before)
    or (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)
      from public.audit_logs a) is distinct from (select audits from auth_privileges_rows_before) then
    raise exception 'auth_privileges_durable_row_change';
  end if;
end;
$no_durable_row_changes$;
\echo 'auth_privileges_direct_9_calls_pass'
\echo 'auth_privileges_rows_unchanged'
\echo 'auth_session_privileges_pass'
