\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.profiles, public.audit_logs in share row exclusive mode;

do $$
declare
  entry public.audit_logs%rowtype;
begin
  select * into strict entry from public.audit_logs
  where action = 'admin.bootstrap'
    and metadata->>'requestId' = 'doso-first-admin-20261106';
  if entry.metadata->>'previousRole' is distinct from 'user'
     or entry.metadata->>'newRole' is distinct from 'admin'
     or entry.target_user_id is null
     or entry.resource_id is distinct from entry.target_user_id::text then
    raise exception 'bootstrap_audit_invalid';
  end if;
  if exists (select 1 from public.audit_logs where id > entry.id
      and target_user_id = entry.target_user_id
      and action in ('user.role_changed', 'admin.bootstrap', 'admin.bootstrap_rolled_back')) then
    raise exception 'bootstrap_role_changed_since_apply';
  end if;
  update public.profiles set app_role = 'user'
  where id = entry.target_user_id and app_role = 'admin';
  if not found then
    raise exception 'bootstrap_target_no_longer_admin';
  end if;
  insert into public.audit_logs(target_user_id, action, resource_type, resource_id, metadata)
  values (entry.target_user_id, 'admin.bootstrap_rolled_back', 'user', entry.target_user_id::text,
    jsonb_build_object('previousRole', 'admin', 'newRole', 'user',
      'bootstrapAuditId', entry.id, 'requestId', 'doso-first-admin-20261106',
      'reason', 'operator_requested_bootstrap_rollback', 'operator', current_user));
end;
$$;
commit;
\echo PASS admin_bootstrap_rolled_back
