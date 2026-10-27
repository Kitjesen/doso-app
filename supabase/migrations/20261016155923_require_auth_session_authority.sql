-- Local candidate only. Requires preceding outbox/profile migrations and a
-- separately reviewed rollout. This file is not production deployment approval.
-- New statements observe committed Auth-session deletion; this is not in-flight
-- cancellation, JWT verification, or time-box/inactivity expiry enforcement.
do $dependencies$
begin
  if pg_catalog.to_regclass('auth.sessions') is null
     or pg_catalog.to_regclass('public.account_email_features') is null
     or pg_catalog.to_regclass('public.account_email_outbox') is null then
    raise exception using errcode = '55000', message = 'auth_session_authority_dependencies_missing';
  end if;
end;
$dependencies$;

-- Internal only: registration has no terminal yet, so must not call the
-- terminal-dependent gate and create a circular bootstrap precondition.
create or replace function private.is_current_auth_session_present()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions as sessions
    where sessions.id = (select private.current_session_id())
      and sessions.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_current_auth_session_present() from public, anon, authenticated, service_role;

create or replace function private.is_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_current_auth_session_present()
    and exists (
      select 1 from public.account_terminals as terminals
      where terminals.user_id = (select auth.uid())
        and terminals.auth_session_id = (select private.current_session_id())
        and terminals.revoked_at is null
    );
$$;
revoke all on function private.is_session_active() from public, anon, authenticated, service_role;
grant execute on function private.is_session_active() to authenticated, service_role;

-- Preserve the latest local registration contract, including installation ID
-- retention, notification dedupe/rate limits, transactional outbox and audit.
create or replace function public.register_account_terminal(
  p_installation_id text,
  p_platform text,
  p_device_label text,
  p_app_version text,
  p_user_agent text default null
) returns public.account_terminals
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := private.current_session_id();
  v_terminal public.account_terminals;
  v_email text;
  v_email_status text := 'disabled';
  v_installation_id text;
  v_installation_digest text;
  v_installation_retained boolean;
  v_recent_email_count integer;
begin
  if v_user_id is null or v_session_id is null then
    raise exception 'authenticated session is required';
  end if;
  if not private.is_current_auth_session_present() then
    raise exception using errcode = '42501', message = 'auth_session_inactive';
  end if;
  if not private.is_account_active() then raise exception 'account is not active'; end if;
  if p_installation_id is null or pg_catalog.btrim(p_installation_id)=''
    or p_device_label is null or pg_catalog.btrim(p_device_label)='' then
    raise exception 'installation id and device label are required';
  end if;
  v_installation_id := left(pg_catalog.btrim(p_installation_id),200);

  insert into public.account_terminals(
    user_id,auth_session_id,installation_id,platform,device_label,app_version,user_agent
  ) values (
    v_user_id,v_session_id,v_installation_id,
    lower(left(pg_catalog.btrim(p_platform),30)),left(pg_catalog.btrim(p_device_label),200),
    left(nullif(pg_catalog.btrim(p_app_version),''),100),
    left(nullif(pg_catalog.btrim(p_user_agent),''),500)
  ) on conflict(auth_session_id) do update
  set platform=excluded.platform,device_label=excluded.device_label,app_version=excluded.app_version,
      user_agent=excluded.user_agent,last_seen_at=now()
  where account_terminals.user_id=excluded.user_id
    and account_terminals.revoked_at is null
  returning * into v_terminal;
  if v_terminal.id is null then raise exception 'current session has been revoked'; end if;
  v_installation_retained := v_terminal.installation_id <> v_installation_id;

  v_installation_digest := encode(extensions.digest(
    convert_to(v_user_id::text||':'||v_terminal.installation_id,'UTF8'),'sha256'),'hex');

  if coalesce((select f.enabled from public.account_email_features f
    where f.kind='new_device_login'),false) then
    select lower(nullif(pg_catalog.btrim(u.email),'')) into v_email
    from auth.users u where u.id=v_user_id;
    if v_email is null then
      v_email_status := 'not_applicable';
    else
      -- A client controls installation_id. Serialize per user, retain the first
      -- installation_id bound to a session, deduplicate before rate limiting,
      -- and cap new notifications so random IDs cannot become an email bomb.
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('doso_account_email'),
        pg_catalog.hashtext(v_user_id::text)
      );
      if exists (
        select 1 from public.account_email_outbox o
        where o.kind='new_device_login' and o.dedupe_digest=v_installation_digest
      ) then
        v_email_status := 'deduplicated';
      else
        select count(*) into v_recent_email_count
        from public.account_email_outbox o
        where o.kind='new_device_login' and o.user_id=v_user_id
          and o.created_at>=now()-interval '24 hours';
        if v_recent_email_count>=3 then
          v_email_status := 'rate_limited';
        else
          insert into public.account_email_outbox(kind,dedupe_digest,user_id,recipient_email,payload)
          values ('new_device_login',v_installation_digest,v_user_id,v_email,jsonb_build_object(
            'event_time',to_char(now() at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS "Asia/Shanghai"'),
            'device',concat_ws(' · ',nullif(v_terminal.platform,''),nullif(v_terminal.device_label,'')),
            'security_url','https://dosorobotics.com/account/security'))
          on conflict(kind,dedupe_digest) do nothing;
          v_email_status := case when found then 'queued' else 'deduplicated' end;
        end if;
      end if;
    end if;
  end if;

  insert into public.audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,metadata)
  values(v_user_id,v_user_id,'terminal.register','terminal',v_terminal.id::text,
    jsonb_build_object('installationDigest',v_installation_digest,
      'installationIdRetained',v_installation_retained,'accountSecurityEmail',v_email_status));
  return v_terminal;
end $$;

revoke all on function public.register_account_terminal(text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.register_account_terminal(text, text, text, text, text) to authenticated;
