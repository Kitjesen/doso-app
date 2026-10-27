create or replace function public.admin_suspend_user_account(
  p_actor_id uuid,
  p_actor_role text,
  p_user_id uuid,
  p_reason text,
  p_request_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked integer;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user was not found';
  end if;

  update public.profiles
  set account_status = 'suspended',
      suspended_at = coalesce(suspended_at, now()),
      suspension_reason = left(coalesce(nullif(btrim(p_reason), ''), 'admin_suspension'), 500)
  where id = p_user_id;

  update public.account_terminals
  set revoked_at = now(), revocation_reason = 'account_suspended'
  where user_id = p_user_id and revoked_at is null;
  get diagnostics v_revoked = row_count;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_actor_id,
    p_user_id,
    'user.suspended',
    'user',
    p_user_id::text,
    jsonb_build_object(
      'actorRole', left(coalesce(p_actor_role, 'unknown'), 40),
      'outcome', 'success',
      'requestId', left(coalesce(p_request_id, ''), 200),
      'reason', left(coalesce(nullif(btrim(p_reason), ''), 'admin_suspension'), 500),
      'revokedCount', v_revoked,
      'authSyncPending', true
    )
  );

  return v_revoked;
end;
$$;

create or replace function public.admin_activate_user_account(
  p_actor_id uuid,
  p_actor_role text,
  p_user_id uuid,
  p_reason text,
  p_request_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user was not found';
  end if;

  update public.profiles
  set account_status = 'active', suspended_at = null, suspension_reason = null
  where id = p_user_id;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_actor_id,
    p_user_id,
    'user.active',
    'user',
    p_user_id::text,
    jsonb_build_object(
      'actorRole', left(coalesce(p_actor_role, 'unknown'), 40),
      'outcome', 'success',
      'requestId', left(coalesce(p_request_id, ''), 200),
      'reason', left(coalesce(nullif(btrim(p_reason), ''), 'admin_reactivation'), 500),
      'authSyncCompleted', true
    )
  );
end;
$$;

create or replace function public.admin_revoke_user_terminal(
  p_actor_id uuid,
  p_actor_role text,
  p_user_id uuid,
  p_terminal_id uuid,
  p_reason text,
  p_request_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal public.account_terminals;
  v_affected integer;
begin
  select * into v_terminal
  from public.account_terminals
  where id = p_terminal_id
  for update;

  if v_terminal.id is null or v_terminal.user_id <> p_user_id then
    raise exception 'terminal does not belong to user';
  end if;

  update public.account_terminals
  set revoked_at = now(),
      revocation_reason = left(coalesce(nullif(btrim(p_reason), ''), 'admin_terminal_revoke'), 200)
  where id = p_terminal_id and user_id = p_user_id and revoked_at is null;
  get diagnostics v_affected = row_count;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_actor_id,
    p_user_id,
    'terminal.revoked_by_admin',
    'terminal',
    p_terminal_id::text,
    jsonb_build_object(
      'actorRole', left(coalesce(p_actor_role, 'unknown'), 40),
      'outcome', 'success',
      'requestId', left(coalesce(p_request_id, ''), 200),
      'reason', left(coalesce(nullif(btrim(p_reason), ''), 'admin_terminal_revoke'), 200),
      'revoked', v_affected = 1,
      'targetUserId', p_user_id
    )
  );

  return v_affected;
end;
$$;

revoke all on function public.admin_suspend_user_account(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_activate_user_account(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_revoke_user_terminal(uuid, text, uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.admin_suspend_user_account(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.admin_activate_user_account(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.admin_revoke_user_terminal(uuid, text, uuid, uuid, text, text)
  to service_role;
