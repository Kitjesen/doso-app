\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table auth.users, public.profiles, public.audit_logs in share row exclusive mode;

do $$
declare
  target public.profiles%rowtype;
begin
  if (select count(*) from auth.users) <> 1
     or (select count(*) from public.profiles) <> 1 then
    raise exception 'bootstrap_requires_one_account';
  end if;
  if exists (select 1 from public.audit_logs where action = 'admin.bootstrap') then
    raise exception 'bootstrap_already_recorded';
  end if;
  select p.* into strict target from public.profiles p join auth.users u on u.id = p.id;
  if target.account_status <> 'active' or target.app_role <> 'user' then
    raise exception 'bootstrap_requires_active_user';
  end if;

  update public.profiles set app_role = 'admin' where id = target.id;
  insert into public.audit_logs(target_user_id, action, resource_type, resource_id, metadata)
  values (target.id, 'admin.bootstrap', 'user', target.id::text,
    jsonb_build_object('previousRole', 'user', 'newRole', 'admin',
      'requestId', 'doso-first-admin-20261106',
      'reason', 'owner_confirmed_existing_sole_account_as_admin',
      'operator', current_user));
end;
$$;
commit;
\echo PASS admin_bootstrap_committed
