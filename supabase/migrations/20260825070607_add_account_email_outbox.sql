create table public.account_email_features (
  kind text primary key check (kind = 'new_device_login'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.account_email_features (kind, enabled)
values ('new_device_login', false);

create table public.account_email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null references public.account_email_features(kind),
  dedupe_digest text not null,
  user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 5,
  manual_retry_allowance smallint not null default 0,
  manual_retry_count smallint not null default 0,
  available_at timestamptz not null default now(),
  lease_owner uuid,
  lease_token uuid,
  leased_until timestamptz,
  attempt_id uuid,
  dispatch_started_at timestamptz,
  provider_request_id text,
  provider_env_id text,
  last_error_code text,
  last_error_summary text,
  accepted_at timestamptz,
  unknown_at timestamptz,
  dead_at timestamptz,
  redacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, dedupe_digest),
  check (dedupe_digest ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16384),
  check (status in ('queued','leased','dispatching','accepted','delivery_unknown','dead')),
  check (attempt_count >= 0 and max_attempts between 1 and 12
    and attempt_count <= max_attempts + 1),
  check (manual_retry_allowance between 0 and 1
    and manual_retry_count between 0 and 1),
  constraint account_email_outbox_state_check check (
    (status='queued' and lease_owner is null and lease_token is null and leased_until is null
      and attempt_id is null and dispatch_started_at is null
      and accepted_at is null and unknown_at is null and dead_at is null)
    or (status='leased' and lease_owner is not null and lease_token is not null and leased_until is not null
      and attempt_id is not null and dispatch_started_at is null
      and accepted_at is null and unknown_at is null and dead_at is null)
    or (status='dispatching' and lease_owner is not null and lease_token is not null and leased_until is not null
      and attempt_id is not null and dispatch_started_at is not null
      and accepted_at is null and unknown_at is null and dead_at is null)
    or (status='accepted' and lease_owner is null and lease_token is null and leased_until is null
      and attempt_id is not null and dispatch_started_at is not null
      and accepted_at is not null and unknown_at is null and dead_at is null)
    or (status='delivery_unknown' and lease_owner is null and lease_token is null and leased_until is null
      and attempt_id is not null and dispatch_started_at is not null
      and accepted_at is null and unknown_at is not null and dead_at is null)
    or (status='dead' and lease_owner is null and lease_token is null and leased_until is null
      and accepted_at is null and unknown_at is null and dead_at is not null)
  )
);

create index account_email_outbox_claim_idx
  on public.account_email_outbox(available_at, created_at)
  where status in ('queued','leased');
create index account_email_outbox_dispatch_watch_idx
  on public.account_email_outbox(leased_until, dispatch_started_at)
  where status = 'dispatching';
create index account_email_outbox_operations_idx
  on public.account_email_outbox(status, updated_at);

alter table public.account_email_features enable row level security;
alter table public.account_email_outbox enable row level security;
revoke all on table public.account_email_features from public,anon,authenticated,service_role;
revoke all on table public.account_email_outbox from public,anon,authenticated,service_role;

-- One SQL statement transaction owns terminal registration, optional enqueue,
-- and terminal.register audit. The signature remains compatible with clients.
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

-- Exactly one message is claimed and the lease is always a server constant.
create function public.claim_account_email(p_worker_id uuid)
returns table(
  id uuid,kind text,recipient_email text,payload jsonb,
  lease_token uuid,attempt_id uuid,attempt_count smallint
)
language plpgsql security definer set search_path = '' as $$
begin
  if p_worker_id is null then raise exception 'worker_id_required' using errcode='22023'; end if;

  update public.account_email_outbox o
  set status='delivery_unknown',lease_owner=null,lease_token=null,leased_until=null,
      unknown_at=now(),last_error_code=coalesce(o.last_error_code,'dispatch_lease_expired'),
      last_error_summary=coalesce(o.last_error_summary,
        'Dispatch outcome was not durably acknowledged before its lease expired.'),updated_at=now()
  where o.status='dispatching' and o.leased_until<=now();

  update public.account_email_outbox o
  set status='dead',lease_owner=null,lease_token=null,leased_until=null,
      attempt_id=null,dispatch_started_at=null,dead_at=now(),
      last_error_code=coalesce(o.last_error_code,'max_attempts_exhausted'),
      last_error_summary=coalesce(o.last_error_summary,
        'Maximum definitive delivery attempts were exhausted.'),updated_at=now()
  where o.attempt_count>=o.max_attempts and o.manual_retry_allowance=0
    and ((o.status='queued' and o.available_at<=now())
      or (o.status='leased' and o.leased_until<=now()));

  return query with candidate as (
    select o.id from public.account_email_outbox o
    where (o.attempt_count<o.max_attempts or o.manual_retry_allowance>0)
      and exists (
        select 1 from public.account_email_features f
        where f.kind=o.kind and f.enabled
      )
      and ((o.status='queued' and o.available_at<=now())
        or (o.status='leased' and o.leased_until<=now()))
    order by o.available_at,o.created_at for update skip locked limit 1
  ) update public.account_email_outbox o
  set status='leased',attempt_count=o.attempt_count+1,lease_owner=p_worker_id,
      lease_token=gen_random_uuid(),leased_until=now()+interval '90 seconds',
      attempt_id=gen_random_uuid(),dispatch_started_at=null,
      manual_retry_allowance=0,
      last_error_code=null,last_error_summary=null,updated_at=now()
  from candidate c where o.id=c.id
  returning o.id,o.kind,o.recipient_email,o.payload,o.lease_token,o.attempt_id,o.attempt_count;
end $$;

create function public.begin_account_email_dispatch(
  p_id uuid,p_lease_token uuid,p_attempt_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare v boolean; begin
  update public.account_email_outbox set status='dispatching',dispatch_started_at=now(),updated_at=now()
  where id=p_id and status='leased' and lease_token=p_lease_token
    and attempt_id=p_attempt_id and leased_until>now()
    and exists (
      select 1 from public.account_email_features f
      where f.kind=account_email_outbox.kind and f.enabled
    );
  v:=found; return v;
end $$;

create function public.accept_account_email(
  p_id uuid,p_attempt_id uuid,p_provider_request_id text,p_provider_env_id text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v boolean; begin
  update public.account_email_outbox
  set status='accepted',lease_owner=null,lease_token=null,leased_until=null,
      provider_request_id=left(nullif(pg_catalog.btrim(p_provider_request_id),''),500),
      provider_env_id=left(nullif(pg_catalog.btrim(p_provider_env_id),''),500),
      accepted_at=now(),last_error_code=null,last_error_summary=null,updated_at=now()
  where id=p_id and status='dispatching' and attempt_id=p_attempt_id;
  v:=found; return v;
end $$;

create function public.mark_account_email_unknown(
  p_id uuid,p_attempt_id uuid,p_error_code text,p_error_summary text,
  p_provider_request_id text default null,p_provider_env_id text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v boolean; begin
  update public.account_email_outbox
  set status='delivery_unknown',lease_owner=null,lease_token=null,leased_until=null,
      provider_request_id=coalesce(left(nullif(pg_catalog.btrim(p_provider_request_id),''),500),provider_request_id),
      provider_env_id=coalesce(left(nullif(pg_catalog.btrim(p_provider_env_id),''),500),provider_env_id),
      unknown_at=now(),
      last_error_code=left(coalesce(nullif(pg_catalog.btrim(p_error_code),''),'delivery_unknown'),200),
      last_error_summary=left(coalesce(nullif(pg_catalog.btrim(p_error_summary),''),'Provider outcome is unknown.'),2000),
      updated_at=now()
  where id=p_id and status='dispatching' and attempt_id=p_attempt_id;
  v:=found; return v;
end $$;

create function public.retry_rejected_account_email(
  p_id uuid,p_attempt_id uuid,p_error_code text,p_error_summary text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v boolean; begin
  update public.account_email_outbox o
  set status=case when o.attempt_count>=o.max_attempts then 'dead' else 'queued' end,
      available_at=case when o.attempt_count>=o.max_attempts then o.available_at
        else now()+make_interval(secs=>least(21600,
          (60*power(2,greatest(o.attempt_count-1,0)))::integer)) end,
      lease_owner=null,lease_token=null,leased_until=null,
      attempt_id=case when o.attempt_count>=o.max_attempts then o.attempt_id else null end,
      dispatch_started_at=case when o.attempt_count>=o.max_attempts then o.dispatch_started_at else null end,
      last_error_code=left(coalesce(nullif(pg_catalog.btrim(p_error_code),''),'provider_rejected'),200),
      last_error_summary=left(coalesce(nullif(pg_catalog.btrim(p_error_summary),''),'Provider explicitly rejected the request.'),2000),
      dead_at=case when o.attempt_count>=o.max_attempts then now() else null end,updated_at=now()
  where o.id=p_id and o.status='dispatching' and o.attempt_id=p_attempt_id;
  v:=found; return v;
end $$;

create function public.dead_letter_account_email(
  p_id uuid,p_lease_token uuid,p_attempt_id uuid,p_error_code text,p_error_summary text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v boolean; begin
  update public.account_email_outbox
  set status='dead',lease_owner=null,lease_token=null,leased_until=null,
      attempt_id=case when status='dispatching' then attempt_id else null end,
      dispatch_started_at=case when status='dispatching' then dispatch_started_at else null end,
      last_error_code=left(coalesce(nullif(pg_catalog.btrim(p_error_code),''),'permanent_failure'),200),
      last_error_summary=left(coalesce(nullif(pg_catalog.btrim(p_error_summary),''),'Permanent account email failure.'),2000),
      dead_at=now(),updated_at=now()
  where id=p_id and attempt_id=p_attempt_id
    and ((status='leased' and lease_token=p_lease_token and leased_until>now()) or status='dispatching');
  v:=found; return v;
end $$;

create function public.resolve_account_email_unknown(
  p_id uuid,p_resolution text,p_reason text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v boolean; begin
  if p_resolution not in('accepted','dead') then
    raise exception 'invalid_unknown_resolution' using errcode='22023';
  end if;
  if nullif(pg_catalog.btrim(p_reason),'') is null then
    raise exception 'manual_reason_required' using errcode='22023';
  end if;
  update public.account_email_outbox
  set status=p_resolution,accepted_at=case when p_resolution='accepted' then now() else null end,
      unknown_at=null,dead_at=case when p_resolution='dead' then now() else null end,
      last_error_code='unknown_manually_resolved',
      last_error_summary=left(pg_catalog.btrim(p_reason),2000),updated_at=now()
  where id=p_id and status='delivery_unknown';
  v:=found;
  if v then insert into public.audit_logs(action,resource_type,resource_id,metadata)
    values('account_email.unknown_resolve','account_email',p_id::text,
      jsonb_build_object('resolution',p_resolution,'reason',left(pg_catalog.btrim(p_reason),500)));
  end if;
  return v;
end $$;

create function public.manual_retry_account_email_unknown(
  p_id uuid,p_reason text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v boolean; begin
  if nullif(pg_catalog.btrim(p_reason),'') is null then
    raise exception 'manual_reason_required' using errcode='22023';
  end if;
  update public.account_email_outbox
  set status='queued',available_at=now(),lease_owner=null,lease_token=null,leased_until=null,
      attempt_id=null,dispatch_started_at=null,accepted_at=null,unknown_at=null,dead_at=null,
      manual_retry_allowance=case when attempt_count>=max_attempts then 1 else 0 end,
      manual_retry_count=case when attempt_count>=max_attempts then manual_retry_count+1 else manual_retry_count end,
      last_error_code='manual_retry_duplicate_possible',
      last_error_summary=left(pg_catalog.btrim(p_reason),2000),updated_at=now()
  where id=p_id and status='delivery_unknown'
    and redacted_at is null
    and (attempt_count<max_attempts or manual_retry_count<1);
  v:=found;
  if v then insert into public.audit_logs(action,resource_type,resource_id,metadata)
    values('account_email.unknown_retry','account_email',p_id::text,
      jsonb_build_object('reason',left(pg_catalog.btrim(p_reason),500),'possibleDuplicate',true));
  end if;
  return v;
end $$;

create function public.redact_account_email_outbox(
  p_before timestamptz default now()-interval '30 days',p_limit integer default 500
) returns integer language plpgsql security definer set search_path='' as $$
declare v integer; begin
  with candidates as (
    select id from public.account_email_outbox
    where status in('accepted','dead','delivery_unknown')
      and updated_at<coalesce(p_before,now()-interval '30 days')
      and redacted_at is null
    order by updated_at for update skip locked
    limit least(greatest(coalesce(p_limit,500),1),5000)
  ) update public.account_email_outbox o
  set user_id=null,recipient_email='[redacted]',payload='{}'::jsonb,
      last_error_code=null,last_error_summary=null,
      redacted_at=now(),updated_at=now()
  from candidates c where o.id=c.id;
  get diagnostics v=row_count; return v;
end $$;

revoke all on function public.register_account_terminal(text,text,text,text,text) from public,anon;
grant execute on function public.register_account_terminal(text,text,text,text,text) to authenticated;
revoke all on function public.claim_account_email(uuid) from public,anon,authenticated,service_role;
revoke all on function public.begin_account_email_dispatch(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.accept_account_email(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.mark_account_email_unknown(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.retry_rejected_account_email(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.dead_letter_account_email(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.resolve_account_email_unknown(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.manual_retry_account_email_unknown(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.redact_account_email_outbox(timestamptz,integer) from public,anon,authenticated,service_role;
grant execute on function public.claim_account_email(uuid) to service_role;
grant execute on function public.begin_account_email_dispatch(uuid,uuid,uuid) to service_role;
grant execute on function public.accept_account_email(uuid,uuid,text,text) to service_role;
grant execute on function public.mark_account_email_unknown(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.retry_rejected_account_email(uuid,uuid,text,text) to service_role;
grant execute on function public.dead_letter_account_email(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.resolve_account_email_unknown(uuid,text,text) to service_role;
grant execute on function public.manual_retry_account_email_unknown(uuid,text) to service_role;
grant execute on function public.redact_account_email_outbox(timestamptz,integer) to service_role;

comment on table public.account_email_outbox is
  'Server-only outbox. accepted means DirectMail accepted the API request, not inbox delivery. delivery_unknown is never automatically retried.';
comment on function public.manual_retry_account_email_unknown(uuid,text) is
  'Manual-only recovery for unknown dispatches. An operator reason is mandatory and a duplicate email is possible.';
