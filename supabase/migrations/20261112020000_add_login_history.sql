-- Capture a login snapshot from the verified Auth session without exposing
-- auth.sessions or the append-only audit table to ordinary clients.
create or replace function public.capture_account_login(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_ip text;
begin
  select id, user_id, created_at, ip
    into v_session
    from auth.sessions
   where id = p_session_id
     and user_id = p_user_id;
  if v_session.id is null then
    return false;
  end if;

  v_ip := nullif(btrim(v_session.ip::text), '');
  insert into public.audit_logs(
    actor_user_id, target_user_id, action, resource_type, resource_id, metadata, created_at
  )
  select p_user_id, p_user_id, 'account.login', 'account_login', p_session_id::text,
    jsonb_build_object(
      'loginAt', v_session.created_at,
      'loginIp', v_ip
    ),
    v_session.created_at
  where not exists (
    select 1 from public.audit_logs
     where action = 'account.login'
       and resource_type = 'account_login'
       and resource_id = p_session_id::text
  )
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.capture_account_login(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.capture_account_login(uuid, uuid) to service_role;

create unique index if not exists audit_logs_account_login_unique_idx
  on public.audit_logs(resource_id)
  where action = 'account.login' and resource_type = 'account_login';

create index if not exists audit_logs_account_login_idx
  on public.audit_logs(target_user_id, created_at desc)
  where action = 'account.login' and resource_type = 'account_login';

-- Login history is exposed through the narrow account-sessions projection.
-- Keep the session id and raw metadata out of direct PostgREST reads.
drop policy if exists "audit_logs_select_related" on public.audit_logs;
create policy "audit_logs_select_related"
on public.audit_logs for select to authenticated
using (
  action <> 'account.login'
  and (actor_user_id = (select auth.uid()) or target_user_id = (select auth.uid()))
  and (select private.is_account_active())
  and (select private.is_session_active())
);
