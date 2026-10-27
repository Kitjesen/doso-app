create type public.username_provenance as enum (
  'registration',
  'manual_claim',
  'admin_verified',
  'legacy_inferred',
  'social_provisional'
);

alter table public.profiles
  add column username_provenance public.username_provenance;

-- The previous migration marked every pre-existing profile as claimed by
-- copying created_at into username_claimed_at. That exact timestamp pair is
-- the corrective fingerprint for a legacy inferred value. Later explicit
-- email registrations and one-time claims use clock_timestamp(), so their
-- claimed marker is demonstrably different from profile creation time.
update public.profiles as profiles
set username_provenance = case
      when profiles.username_claimed_at = profiles.created_at
        then 'legacy_inferred'::public.username_provenance
      when profiles.username_claimed_at is not null
       and coalesce(users.raw_app_meta_data ->> 'provider', '') = 'email'
       and nullif(pg_catalog.btrim(users.raw_user_meta_data ->> 'username'), '') is not null
       and profiles.username = pg_catalog.lower(
         pg_catalog.btrim(users.raw_user_meta_data ->> 'username')
       )
        then 'registration'::public.username_provenance
      when profiles.username_claimed_at is not null
        then 'manual_claim'::public.username_provenance
      when coalesce(users.raw_app_meta_data ->> 'provider', '') not in ('', 'email')
        then 'social_provisional'::public.username_provenance
      else 'legacy_inferred'::public.username_provenance
    end,
    username_claimed_at = case
      when profiles.username_claimed_at = profiles.created_at then null
      else profiles.username_claimed_at
    end
from auth.users as users
where users.id = profiles.id;

-- A profile should always have a matching Auth user, but keep the migration
-- total and conservative if a damaged environment contains an orphan row.
update public.profiles
set username_provenance = 'legacy_inferred',
    username_claimed_at = null
where username_provenance is null;

alter table public.profiles
  alter column username_provenance set not null,
  add constraint profiles_username_provenance_claim_check
    check (
      (
        username_provenance in ('registration', 'manual_claim', 'admin_verified')
        and username_claimed_at is not null
      )
      or
      (
        username_provenance in ('legacy_inferred', 'social_provisional')
        and username_claimed_at is null
      )
    );

create function private.enforce_username_provenance_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username is not distinct from old.username
     and new.username_claimed_at is not distinct from old.username_claimed_at
     and new.username_provenance is not distinct from old.username_provenance then
    return new;
  end if;

  if old.username_provenance = 'legacy_inferred'
     and new.username_provenance in ('manual_claim', 'admin_verified')
     and old.username_claimed_at is null
     and new.username_claimed_at is not null then
    if new.username_provenance = 'admin_verified'
       and new.username is distinct from old.username then
      raise exception using errcode = 'P0001', message = 'admin_verification_cannot_rename_username';
    end if;
    return new;
  end if;

  if old.username_provenance = 'social_provisional'
     and new.username_provenance = 'manual_claim'
     and old.username_claimed_at is null
     and new.username_claimed_at is not null then
    return new;
  end if;

  raise exception using errcode = 'P0001', message = 'username_provenance_transition_invalid';
end;
$$;

create trigger profiles_enforce_username_provenance_transition
before update of username, username_claimed_at, username_provenance on public.profiles
for each row execute function private.enforce_username_provenance_transition();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw_username text;
  v_username text;
  v_existing_username text;
  v_existing_claimed_at timestamptz;
  v_existing_provenance public.username_provenance;
  v_username_claimed_at timestamptz;
  v_username_provenance public.username_provenance;
  v_display_name text;
  v_base text;
  v_suffix text;
  v_counter integer;
  v_provider text;
begin
  select profiles.username, profiles.username_claimed_at, profiles.username_provenance
  into v_existing_username, v_existing_claimed_at, v_existing_provenance
  from public.profiles as profiles
  where profiles.id = new.id;

  v_raw_username := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'username'), '');
  v_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    v_raw_username,
    pg_catalog.split_part(coalesce(new.email, ''), '@', 1),
    ''
  );
  v_provider := coalesce(new.raw_app_meta_data ->> 'provider', '');

  -- Auth metadata remains editable. Once allocated, all three canonical
  -- username fields are preserved on every subsequent Auth user update.
  if v_existing_username is not null then
    v_username := v_existing_username;
    v_username_claimed_at := v_existing_claimed_at;
    v_username_provenance := v_existing_provenance;
  elsif v_provider = 'email' and v_raw_username is not null then
    v_username := pg_catalog.lower(pg_catalog.btrim(v_raw_username));

    if v_username !~ '^[a-z0-9_]{3,24}$' then
      raise exception using
        errcode = '22023',
        message = 'username must be 3-24 characters using only a-z, 0-9, or underscore';
    end if;

    if v_username = any (array[
      'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
      'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
      'register', 'robot', 'robotics', 'root', 'security', 'signup',
      'staff', 'support', 'system', 'undefined'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'username is reserved';
    end if;

    v_username_claimed_at := pg_catalog.clock_timestamp();
    v_username_provenance := 'registration';
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('doso.username.allocate')
    );

    v_base := 'user_' || pg_catalog.substring(pg_catalog.replace(new.id::text, '-', ''), 1, 12);
    v_username := pg_catalog.left(v_base, 24);
    v_counter := 2;

    while exists (
      select 1
      from public.profiles as profiles
      where profiles.username = v_username
        and profiles.id <> new.id
    ) loop
      v_suffix := '_' || v_counter::text;
      v_username := pg_catalog.left(v_base, 24 - pg_catalog.length(v_suffix)) || v_suffix;
      v_counter := v_counter + 1;
    end loop;

    v_username_claimed_at := null;
    v_username_provenance := case
      when v_provider not in ('', 'email') then 'social_provisional'::public.username_provenance
      else 'legacy_inferred'::public.username_provenance
    end;
  end if;

  insert into public.profiles (
    id, email, username, username_claimed_at, username_provenance,
    display_name, avatar_url
  )
  values (
    new.id,
    coalesce(new.email, ''),
    v_username,
    v_username_claimed_at,
    v_username_provenance,
    v_display_name,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      username = public.profiles.username,
      username_claimed_at = public.profiles.username_claimed_at,
      username_provenance = public.profiles.username_provenance,
      display_name = case
        when excluded.display_name = '' then public.profiles.display_name
        else excluded.display_name
      end,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

create or replace function public.claim_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_current_username text;
  v_claimed_at timestamptz;
  v_provenance public.username_provenance;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode = 'P0001', message = 'account_or_session_inactive';
  end if;

  v_username := pg_catalog.lower(pg_catalog.btrim(p_username));

  if v_username is null or v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception using errcode = '22023', message = 'username_invalid';
  end if;

  if v_username = any (array[
    'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
    'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
    'register', 'robot', 'robotics', 'root', 'security', 'signup',
    'staff', 'support', 'system', 'undefined'
  ]::text[]) then
    raise exception using errcode = '22023', message = 'username_reserved';
  end if;

  select profiles.username, profiles.username_claimed_at, profiles.username_provenance
  into v_current_username, v_claimed_at, v_provenance
  from public.profiles as profiles
  where profiles.id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  if v_provenance in ('registration', 'manual_claim', 'admin_verified') then
    if v_current_username = v_username then
      return v_current_username;
    end if;
    raise exception using errcode = 'P0001', message = 'username_already_claimed';
  end if;

  if v_provenance not in ('legacy_inferred', 'social_provisional')
     or v_claimed_at is not null then
    raise exception using errcode = 'P0001', message = 'username_provenance_invalid';
  end if;

  begin
    update public.profiles
    set username = v_username,
        username_claimed_at = pg_catalog.clock_timestamp(),
        username_provenance = 'manual_claim'
    where id = v_user_id;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'username_taken';
  end;

  return v_username;
end;
$$;

create function public.admin_verify_username(
  p_actor_id uuid,
  p_actor_role text,
  p_user_id uuid,
  p_reason text,
  p_request_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_provenance public.username_provenance;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_request_id text := nullif(pg_catalog.btrim(p_request_id), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_actor_id is null then
    raise exception using errcode = '22023', message = 'actor_id_required';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'reason_required';
  end if;
  if v_request_id is null then
    raise exception using errcode = '22023', message = 'request_id_required';
  end if;

  select profiles.username, profiles.username_provenance
  into v_username, v_provenance
  from public.profiles as profiles
  where profiles.id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  if v_provenance = 'admin_verified' then
    return v_username;
  end if;

  if v_provenance <> 'legacy_inferred' then
    raise exception using errcode = 'P0001', message = 'username_not_admin_verifiable';
  end if;

  update public.profiles
  set username_provenance = 'admin_verified',
      username_claimed_at = pg_catalog.clock_timestamp()
  where id = p_user_id;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_actor_id,
    p_user_id,
    'username.admin_verified',
    'user',
    p_user_id::text,
    pg_catalog.jsonb_build_object(
      'actorRole', pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_actor_role), ''), 'unknown'), 40),
      'outcome', 'success',
      'requestId', pg_catalog.left(v_request_id, 200),
      'reason', pg_catalog.left(v_reason, 500),
      'provenanceFrom', 'legacy_inferred',
      'provenanceTo', 'admin_verified'
    )
  );

  return v_username;
end;
$$;

-- SECURITY DEFINER functions remain the only service-role write path for the
-- canonical username state. Preserve direct backend administration of the
-- other profile fields without retaining table-wide UPDATE.
revoke insert, update on table public.profiles from service_role;
grant update (
  email, display_name, avatar_url, app_role, account_status,
  suspended_at, suspension_reason, updated_at
) on table public.profiles to service_role;

revoke all on function private.enforce_username_provenance_transition()
  from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.claim_username(text) from public, anon;
revoke all on function public.admin_verify_username(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_username(text) to authenticated;
grant execute on function public.admin_verify_username(uuid, text, uuid, text, text)
  to service_role;

comment on column public.profiles.username_provenance is
  'Trusted origin/state for the canonical username. Claimed states are registration, manual_claim, and admin_verified.';
comment on function public.admin_verify_username(uuid, text, uuid, text, text) is
  'Service-role-only audited confirmation of an unchanged legacy-inferred username; repeated confirmation is idempotent.';
