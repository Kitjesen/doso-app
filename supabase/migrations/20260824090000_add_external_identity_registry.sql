create table private.account_identities (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null check (length(btrim(provider_key)) between 1 and 160),
  provider_subject_hash bytea not null check (octet_length(provider_subject_hash) = 32),
  auth_identity_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_verified boolean not null default false,
  linked_at timestamptz not null,
  provider_last_sign_in_at timestamptz,
  last_observed_at timestamptz not null,
  unlinked_at timestamptz,
  unlink_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_identities_provider_subject_key unique (provider_key, provider_subject_hash)
);

create index account_identities_user_id_idx
  on private.account_identities(user_id, linked_at desc);

alter table private.account_identities enable row level security;

revoke all on table private.account_identities from public, anon, authenticated, service_role;

create function private.external_identity_subject_hash(p_provider_key text, p_provider_id text)
returns bytea
language sql
immutable
strict
set search_path = ''
as $$
  select extensions.digest(
    pg_catalog.convert_to(p_provider_key, 'UTF8')
      || pg_catalog.decode('00', 'hex')
      || pg_catalog.convert_to(p_provider_id, 'UTF8'),
    'sha256'
  );
$$;

create function private.external_identity_kind(p_provider_key text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case p_provider_key
    when 'email' then 'email'
    when 'apple' then 'apple'
    when 'wechat' then 'wechat'
    when 'custom:wechat' then 'wechat'
    when 'qq' then 'qq'
    when 'custom:qq' then 'qq'
    else 'other'
  end;
$$;

create function private.audit_identity_transition(
  p_action text,
  p_registry_id uuid,
  p_user_id uuid,
  p_provider_key text,
  p_auth_identity_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    actor_user_id, target_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    p_user_id,
    p_action,
    'identity',
    p_registry_id::text,
    jsonb_build_object(
      'provider', p_provider_key,
      'kind', private.external_identity_kind(p_provider_key),
      'authIdentityId', p_auth_identity_id,
      'eventKey', p_action || ':' || p_registry_id::text || ':' || pg_catalog.clock_timestamp()::text
    )
  );
$$;

create function private.capture_auth_identity(
  p_auth_identity_id uuid,
  p_user_id uuid,
  p_provider_key text,
  p_provider_id text,
  p_identity_data jsonb,
  p_last_sign_in_at timestamptz,
  p_linked_at timestamptz,
  p_emit_audit boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_registry private.account_identities;
  v_email_verified boolean;
  v_action text;
begin
  if p_provider_key is null or btrim(p_provider_key) = ''
     or p_provider_id is null or p_provider_id = '' then
    raise exception 'external_identity_invalid' using errcode = '22023';
  end if;

  v_hash := private.external_identity_subject_hash(p_provider_key, p_provider_id);
  v_email_verified := lower(coalesce(p_identity_data ->> 'email_verified', 'false'))
    in ('true', 't', '1', 'yes');

  select * into v_registry
  from private.account_identities
  where provider_key = p_provider_key
    and provider_subject_hash = v_hash
  for update;

  if v_registry.id is not null and v_registry.user_id <> p_user_id then
    raise exception 'external_identity_conflict' using errcode = 'P0001';
  end if;

  if v_registry.id is null then
    insert into private.account_identities (
      provider_key, provider_subject_hash, auth_identity_id, user_id,
      email_verified, linked_at, provider_last_sign_in_at, last_observed_at
    ) values (
      p_provider_key, v_hash, p_auth_identity_id, p_user_id,
      v_email_verified, coalesce(p_linked_at, now()), p_last_sign_in_at, now()
    )
    returning * into v_registry;
    v_action := 'identity.linked';
  else
    if v_registry.unlinked_at is not null then
      v_action := 'identity.relinked';
    end if;

    update private.account_identities
    set auth_identity_id = p_auth_identity_id,
        email_verified = v_email_verified,
        provider_last_sign_in_at = p_last_sign_in_at,
        last_observed_at = now(),
        linked_at = case when unlinked_at is null then linked_at else now() end,
        unlinked_at = null,
        unlink_reason = null,
        updated_at = now()
    where id = v_registry.id
    returning * into v_registry;
  end if;

  if p_emit_audit and v_action is not null then
    perform private.audit_identity_transition(
      v_action, v_registry.id, p_user_id, p_provider_key, p_auth_identity_id
    );
  end if;
end;
$$;

create function private.tombstone_auth_identity(
  p_auth_identity_id uuid,
  p_user_id uuid,
  p_provider_key text,
  p_provider_id text,
  p_reason text,
  p_emit_audit boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registry private.account_identities;
begin
  update private.account_identities
  set unlinked_at = now(),
      unlink_reason = left(coalesce(nullif(btrim(p_reason), ''), 'provider_unlinked'), 160),
      last_observed_at = now(),
      updated_at = now()
  where provider_key = p_provider_key
    and provider_subject_hash = private.external_identity_subject_hash(p_provider_key, p_provider_id)
    and user_id = p_user_id
    and unlinked_at is null
  returning * into v_registry;

  if p_emit_audit and v_registry.id is not null then
    perform private.audit_identity_transition(
      'identity.unlinked', v_registry.id, p_user_id, p_provider_key, p_auth_identity_id
    );
  end if;
end;
$$;

create function private.sync_auth_identity_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform private.tombstone_auth_identity(
        old.id, old.user_id, old.provider, old.provider_id, 'provider_unlinked', true
      );
      return old;
    end if;

    if tg_op = 'UPDATE' and (
      old.user_id is distinct from new.user_id
      or old.provider is distinct from new.provider
      or old.provider_id is distinct from new.provider_id
    ) then
      perform private.tombstone_auth_identity(
        old.id, old.user_id, old.provider, old.provider_id, 'identity_changed', true
      );
    end if;

    perform private.capture_auth_identity(
      new.id, new.user_id, new.provider, new.provider_id, new.identity_data,
      new.last_sign_in_at, new.created_at, true
    );
    return new;
  exception when others then
    -- Auth is the source of truth. Projection drift is recoverable through the
    -- service-role reconciliation RPC, while a failed login is not.
    raise warning 'identity projection sync skipped (operation %, sqlstate %)', tg_op, sqlstate;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end;
end;
$$;

do $$
declare
  v_identity auth.identities;
begin
  for v_identity in select * from auth.identities loop
    perform private.capture_auth_identity(
      v_identity.id, v_identity.user_id, v_identity.provider, v_identity.provider_id,
      v_identity.identity_data, v_identity.last_sign_in_at, v_identity.created_at, false
    );
  end loop;
end;
$$;

create trigger sync_auth_identity_projection
after insert or update or delete on auth.identities
for each row execute function private.sync_auth_identity_projection();

create function public.admin_reconcile_user_identities(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity auth.identities;
  v_registry private.account_identities;
  v_count integer := 0;
  v_tombstoned_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  -- Auth is authoritative. Preserve active rows that still have an exact
  -- provider + subject match so repeated reconciliation cannot rewrite the
  -- original link time. Only live projection rows missing from Auth are
  -- tombstoned.
  for v_registry in
    update private.account_identities ai
    set unlinked_at = now(),
        unlink_reason = 'reconciliation_missing_from_auth',
        last_observed_at = now(),
        updated_at = now()
    where ai.user_id = p_user_id
      and ai.unlinked_at is null
      and not exists (
        select 1
        from auth.identities i
        where i.user_id = p_user_id
          and i.provider = ai.provider_key
          and private.external_identity_subject_hash(i.provider, i.provider_id)
            = ai.provider_subject_hash
      )
    returning ai.*
  loop
    v_tombstoned_count := v_tombstoned_count + 1;
    perform private.audit_identity_transition(
      'identity.unlinked',
      v_registry.id,
      v_registry.user_id,
      v_registry.provider_key,
      v_registry.auth_identity_id
    );
  end loop;

  for v_identity in
    select * from auth.identities where user_id = p_user_id
  loop
    perform private.capture_auth_identity(
      v_identity.id, v_identity.user_id, v_identity.provider, v_identity.provider_id,
      v_identity.identity_data, v_identity.last_sign_in_at, v_identity.created_at, true
    );
    v_count := v_count + 1;
  end loop;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, resource_type, resource_id, metadata
  ) values (
    null,
    p_user_id,
    'identity.reconciled',
    'user',
    p_user_id::text,
    jsonb_build_object(
      'observedIdentityCount', v_count,
      'tombstonedIdentityCount', v_tombstoned_count
    )
  );

  return v_count;
exception when others then
  -- The RPC error is returned to the caller and the warning remains visible in
  -- Postgres logs. Do not swallow repair failures as the Auth trigger does.
  raise warning 'identity reconciliation failed (user %, sqlstate %)', p_user_id, sqlstate;
  raise;
end;
$$;

create function public.list_my_login_methods()
returns table (
  id uuid,
  provider_key text,
  kind text,
  email_verified boolean,
  linked_at timestamptz,
  last_sign_in_at timestamptz,
  last_observed_at timestamptz,
  unlinked_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_account_active() then
    raise exception 'account is not active' using errcode = 'P0001';
  end if;
  if not private.is_session_active() then
    raise exception 'current session is not active' using errcode = 'P0001';
  end if;

  return query
  select ai.id, ai.provider_key, private.external_identity_kind(ai.provider_key),
         case
           when private.external_identity_kind(ai.provider_key) = 'email'
             then u.email_confirmed_at is not null
           else ai.email_verified
         end,
         ai.linked_at, ai.provider_last_sign_in_at,
         ai.last_observed_at, ai.unlinked_at,
         case when ai.unlinked_at is null then 'active' else 'unlinked' end
  from private.account_identities ai
  join auth.users u on u.id = ai.user_id
  where ai.user_id = auth.uid()
  order by ai.linked_at desc, ai.id;
end;
$$;

create function public.admin_list_user_identities(p_user_id uuid)
returns table (
  id uuid,
  provider_key text,
  kind text,
  email_verified boolean,
  linked_at timestamptz,
  last_sign_in_at timestamptz,
  last_observed_at timestamptz,
  unlinked_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  return query
  select ai.id, ai.provider_key, private.external_identity_kind(ai.provider_key),
         case
           when private.external_identity_kind(ai.provider_key) = 'email'
             then u.email_confirmed_at is not null
           else ai.email_verified
         end,
         ai.linked_at, ai.provider_last_sign_in_at,
         ai.last_observed_at, ai.unlinked_at,
         case when ai.unlinked_at is null then 'active' else 'unlinked' end
  from private.account_identities ai
  join auth.users u on u.id = ai.user_id
  where ai.user_id = p_user_id
  order by ai.linked_at desc, ai.id;
end;
$$;

revoke all on function private.external_identity_subject_hash(text, text) from public, anon, authenticated, service_role;
revoke all on function private.external_identity_kind(text) from public, anon, authenticated, service_role;
revoke all on function private.audit_identity_transition(text, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.capture_auth_identity(uuid, uuid, text, text, jsonb, timestamptz, timestamptz, boolean) from public, anon, authenticated, service_role;
revoke all on function private.tombstone_auth_identity(uuid, uuid, text, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.sync_auth_identity_projection() from public, anon, authenticated, service_role;

revoke all on function public.admin_reconcile_user_identities(uuid) from public, anon, authenticated;
revoke all on function public.list_my_login_methods() from public, anon;
revoke all on function public.admin_list_user_identities(uuid) from public, anon, authenticated;
grant execute on function public.admin_reconcile_user_identities(uuid) to service_role;
grant execute on function public.list_my_login_methods() to authenticated;
grant execute on function public.admin_list_user_identities(uuid) to service_role;

comment on table private.account_identities is
  'DOSO-managed, token-free projection of auth.identities. Provider subjects are stored only as SHA-256 digests.';
