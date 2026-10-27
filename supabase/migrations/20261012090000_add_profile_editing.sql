-- Server-owned provenance distinguishes explicit edits from provider metadata.
-- Candidate only: do not deploy until upgrade/database tests and security gates pass.
-- Protect ALL existing values (including NULL avatars) because their source is
-- unknown. This deliberately stops provider sync for legacy presentation fields.
-- In one ALTER, ADD defaults protect old rows; SET defaults apply only to future
-- INSERTs, so new provider profiles still sync. Never infer ownership from metadata.
alter table public.profiles
  add column display_name_managed_by_user boolean not null default true,
  add column avatar_managed_by_user boolean not null default true,
  add column avatar_lifecycle_epoch bigint not null default 0,
  alter column display_name_managed_by_user set default false,
  alter column avatar_managed_by_user set default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  3145728,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A durable retirement survives Storage's rollback-only permission probe.
-- No row is expired/reused: only the validated profile RPC can attach a path,
-- and it may never attach a retired path. Privileged direct writes are outside
-- this App-writer contract and still require separate deployment review.
create table private.profile_avatar_retirements (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  object_path text primary key,
  retired_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint profile_avatar_retirement_owner_path check (
    object_path ~ ('^' || owner_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$')
  )
);
alter table private.profile_avatar_retirements enable row level security;
revoke all on private.profile_avatar_retirements from public, anon, authenticated, service_role;

create function private.profile_avatar_access_state(p_object_path text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_object_path is null
     or p_object_path !~ ('^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$')
     or not private.is_account_active() or not private.is_session_active() then
    return 'invalid';
  end if;
  if exists (select 1 from private.profile_avatar_retirements
             where owner_id = v_user_id and object_path = p_object_path) then
    return 'retired';
  end if;
  return 'active';
end;
$$;
revoke all on function private.profile_avatar_access_state(text) from public, anon, authenticated, service_role;
grant execute on function private.profile_avatar_access_state(text) to authenticated;

-- Restrictive guards cannot be bypassed by another permissive owner policy.
-- They deliberately leave all other buckets' existing policies unchanged.
create policy profile_avatars_retired_insert_guard on storage.objects
as restrictive for insert to authenticated
with check (bucket_id <> 'profile-avatars' or private.profile_avatar_access_state(name) = 'active');
create policy profile_avatars_retired_delete_guard on storage.objects
as restrictive for delete to authenticated
using (bucket_id <> 'profile-avatars' or private.profile_avatar_access_state(name) = 'retired');

create function public.prepare_my_profile_avatar_cleanup(p_expected_user_id uuid, p_object_path text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_user_id is null or p_expected_user_id is distinct from v_user_id then
    raise exception using errcode = '42501', message = 'profile_identity_mismatch';
  end if;
  if not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode = '42501', message = 'account_or_session_inactive';
  end if;
  if p_object_path is null or p_object_path !~ ('^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$') then
    raise exception using errcode = '22023', message = 'avatar_path_invalid';
  end if;
  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  if v_profile.avatar_url = 'profile-avatars/' || p_object_path then
    return pg_catalog.jsonb_build_object('status','protected-current','ownerId',v_user_id,'objectPath',p_object_path);
  end if;
  if exists (select 1 from private.profile_avatar_retirements
             where owner_id = v_user_id and object_path = p_object_path) then
    if not exists (select 1 from storage.objects where bucket_id = 'profile-avatars' and name = p_object_path) then
      -- A prior timed-out Storage request may already have removed metadata.
      -- Retirement remains durable; this says nothing about physical bytes.
      return pg_catalog.jsonb_build_object('status','retired-missing','ownerId',v_user_id,'objectPath',p_object_path);
    end if;
    return pg_catalog.jsonb_build_object('status','retired','ownerId',v_user_id,'objectPath',p_object_path);
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-avatars' and name = p_object_path) then
    return pg_catalog.jsonb_build_object('status','object-missing','ownerId',v_user_id,'objectPath',p_object_path);
  end if;
  -- This explicit mutation, not an RLS side effect, forces stale RR save/prepare
  -- transactions to fail serialization instead of overlooking a new retirement.
  update public.profiles set avatar_lifecycle_epoch = avatar_lifecycle_epoch + 1 where id = v_user_id;
  insert into private.profile_avatar_retirements(owner_id,object_path) values(v_user_id,p_object_path);
  return pg_catalog.jsonb_build_object('status','retired','ownerId',v_user_id,'objectPath',p_object_path);
end;
$$;
revoke all on function public.prepare_my_profile_avatar_cleanup(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.prepare_my_profile_avatar_cleanup(uuid,text) to authenticated;
revoke update (avatar_lifecycle_epoch) on public.profiles from authenticated;

drop policy if exists "profile_avatars_select_active_owner" on storage.objects;
drop policy if exists "profile_avatars_insert_active_owner" on storage.objects;
drop policy if exists "profile_avatars_delete_active_owner" on storage.objects;

create policy "profile_avatars_select_active_owner"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$')
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "profile_avatars_insert_active_owner"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$')
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create policy "profile_avatars_delete_active_owner"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$')
  and (select private.is_account_active())
  and (select private.is_session_active())
  and not exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and avatar_url = 'profile-avatars/' || storage.objects.name
  )
);

create or replace function private.enforce_profile_avatar_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_count integer;
begin
  if new.bucket_id <> 'profile-avatars' then
    return new;
  end if;
  begin
    v_owner_id := pg_catalog.split_part(new.name, '/', 1)::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'avatar_path_invalid';
  end;
  if auth.uid() is null or v_owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'avatar_owner_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('doso.profile-avatar.' || v_owner_id::text)
  );
  select pg_catalog.count(*)::integer into v_count
  from storage.objects
  where bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = v_owner_id::text;

  if v_count >= 20 then
    raise exception using errcode = 'P0001', message = 'avatar_quota_exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_avatars_enforce_quota on storage.objects;
create trigger profile_avatars_enforce_quota
before insert on storage.objects
for each row when (new.bucket_id = 'profile-avatars')
execute function private.enforce_profile_avatar_quota();

create or replace function private.enforce_profile_edit_values()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- The legacy Apple display-name recovery directly updates this one granted
  -- column. Even a same-value confirmation is an explicit user choice. Provider
  -- sync and the profile RPC run as SECURITY DEFINER; the RPC marks its own edits.
  -- JWT auth.role() cannot distinguish those paths from a direct user update.
  if current_user = 'authenticated' then
    new.display_name_managed_by_user := true;
  end if;

  if new.display_name is distinct from old.display_name then
    new.display_name := pg_catalog.btrim(new.display_name);
    if pg_catalog.char_length(new.display_name) not between 1 and 50
       or new.display_name ~ '[[:cntrl:]]' then
      raise exception using errcode = '22023', message = 'display_name_invalid';
    end if;
  end if;

  if new.avatar_url is distinct from old.avatar_url
     and current_user = 'authenticated' then
    if new.avatar_url is not null
       and (
         auth.uid() is null
         or new.id is distinct from auth.uid()
         or new.avatar_url !~ (
           '^profile-avatars/' || auth.uid()::text ||
           '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$'
         )
       ) then
      raise exception using errcode = '22023', message = 'avatar_path_invalid';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_profile_edit_values on public.profiles;
create trigger profiles_enforce_profile_edit_values
before update of display_name, avatar_url on public.profiles
for each row execute function private.enforce_profile_edit_values();

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
  v_provider_avatar text;
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
  -- Provider/user metadata is not a path-assignment API. In particular it must
  -- never bypass retirement/existence checks by injecting a private bucket key.
  v_provider_avatar := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'avatar_url'), '');
  if v_provider_avatar !~ '^https://[^[:space:][:cntrl:]]+$' then
    v_provider_avatar := null;
  end if;

  if v_existing_username is not null then
    v_username := v_existing_username;
    v_username_claimed_at := v_existing_claimed_at;
    v_username_provenance := v_existing_provenance;
  elsif v_provider = 'email' and v_raw_username is not null then
    v_username := pg_catalog.lower(pg_catalog.btrim(v_raw_username));
    if v_username !~ '^[a-z0-9_]{3,24}$' then
      raise exception using errcode = '22023',
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
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('doso.username.allocate'));
    v_base := 'user_' || pg_catalog.substring(pg_catalog.replace(new.id::text, '-', ''), 1, 12);
    v_username := pg_catalog.left(v_base, 24);
    v_counter := 2;
    while exists (
      select 1 from public.profiles as profiles
      where profiles.username = v_username and profiles.id <> new.id
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
  ) values (
    new.id, coalesce(new.email, ''), v_username, v_username_claimed_at,
    v_username_provenance, v_display_name, v_provider_avatar
  )
  on conflict (id) do update
  set email = excluded.email,
      username = public.profiles.username,
      username_claimed_at = public.profiles.username_claimed_at,
      username_provenance = public.profiles.username_provenance,
      display_name = case
        when public.profiles.display_name_managed_by_user then public.profiles.display_name
        when excluded.display_name = '' then public.profiles.display_name
        else excluded.display_name
      end,
      avatar_url = case
        when public.profiles.avatar_managed_by_user then public.profiles.avatar_url
        else coalesce(excluded.avatar_url, public.profiles.avatar_url)
      end;

  return new;
end;
$$;

create or replace function private.enforce_username_provenance_transition()
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

  -- Any user-initiated rename becomes a fresh manual claim. In particular an
  -- admin-verified name cannot retain admin verification after it changes.
  if new.username is distinct from old.username
     and new.username_provenance = 'manual_claim'
     and old.username_claimed_at is not null
     and new.username_claimed_at is not null
     and new.username_claimed_at > old.username_claimed_at
     and auth.uid() = old.id
     and private.is_account_active()
     and private.is_session_active() then
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

create or replace function public.update_my_profile(
  p_expected_user_id uuid,
  p_username text,
  p_display_name text,
  p_avatar_action text default 'keep',
  p_avatar_path text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := pg_catalog.lower(pg_catalog.btrim(p_username));
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_avatar_action text := pg_catalog.lower(pg_catalog.btrim(p_avatar_action));
  v_current public.profiles;
  v_result public.profiles;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_expected_user_id is null or v_user_id is distinct from p_expected_user_id then
    raise exception using errcode = '42501', message = 'profile_identity_mismatch';
  end if;
  if not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode = 'P0001', message = 'account_or_session_inactive';
  end if;
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
  if v_display_name is null
     or pg_catalog.char_length(v_display_name) not between 1 and 50
     or v_display_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'display_name_invalid';
  end if;
  if v_avatar_action is null or v_avatar_action not in ('keep', 'replace', 'remove') then
    raise exception using errcode = '22023', message = 'avatar_action_invalid';
  end if;

  -- Serialize every App reference change with the durable cleanup reservation.
  -- The lock must precede both the retirement lookup and object existence check.
  select profiles.* into v_current from public.profiles as profiles
  where profiles.id = v_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  if v_avatar_action = 'replace' then
    if p_avatar_path is null or p_avatar_path !~ (
      '^profile-avatars/' || v_user_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$'
    ) then
      raise exception using errcode = '22023', message = 'avatar_path_invalid';
    end if;
    if exists (
      select 1 from private.profile_avatar_retirements
      where owner_id = v_user_id
        and object_path = pg_catalog.substring(p_avatar_path, pg_catalog.char_length('profile-avatars/') + 1)
    ) then
      raise exception using errcode = '22023', message = 'avatar_retired';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'profile-avatars'
        and name = pg_catalog.substring(p_avatar_path, pg_catalog.char_length('profile-avatars/') + 1)
        and (storage.foldername(name))[1] = v_user_id::text
    ) then
      raise exception using errcode = '22023', message = 'avatar_object_missing';
    end if;
  elsif p_avatar_path is not null then
    raise exception using errcode = '22023', message = 'avatar_path_invalid';
  end if;

  begin
    update public.profiles
    set username = v_username,
        username_provenance = case
          when v_username is distinct from v_current.username
            then 'manual_claim'::public.username_provenance
          else v_current.username_provenance
        end,
        username_claimed_at = case
          when v_username is distinct from v_current.username
            then pg_catalog.clock_timestamp()
          else v_current.username_claimed_at
        end,
        display_name = v_display_name,
        display_name_managed_by_user = true,
        avatar_managed_by_user = v_current.avatar_managed_by_user or v_avatar_action <> 'keep',
        avatar_url = case v_avatar_action
          when 'keep' then v_current.avatar_url
          when 'remove' then null
          else p_avatar_path
        end
    where id = v_user_id
    returning * into v_result;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'username_taken';
  end;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_user_id, v_user_id, 'profile.updated', 'user', v_user_id::text,
    pg_catalog.jsonb_build_object(
      'usernameChanged', v_current.username is distinct from v_result.username,
      'displayNameChanged', v_current.display_name is distinct from v_result.display_name,
      'avatarChanged', v_current.avatar_url is distinct from v_result.avatar_url
    )
  );

  return v_result;
end;
$$;

revoke all on function private.enforce_profile_edit_values() from public, anon, authenticated, service_role;
revoke all on function private.enforce_profile_avatar_quota() from public, anon, authenticated, service_role;
revoke all on function public.update_my_profile(uuid, text, text, text, text) from public, anon, service_role;
grant execute on function public.update_my_profile(uuid, text, text, text, text) to authenticated;
revoke update (avatar_url) on table public.profiles from authenticated;
revoke update (display_name_managed_by_user, avatar_managed_by_user) on table public.profiles from authenticated;

comment on function public.update_my_profile(uuid, text, text, text, text) is
  'Atomically edits the authenticated active-session owner profile. Username provenance and account authority fields remain server-owned.';
comment on column public.profiles.avatar_url is
  'Private DOSO avatars store profile-avatars/<owner UUID>/<object UUID>.(jpg|png); legacy trusted-provider URLs may remain until replaced.';
comment on column public.profiles.display_name_managed_by_user is
  'Server-owned protection for migration-existing values, explicit profile edits or direct nickname confirmation. Provider metadata cannot change this flag.';
comment on column public.profiles.avatar_managed_by_user is
  'Server-owned protection for migration-existing values (including NULL), explicit avatar replacement or removal. Provider metadata cannot change this flag.';
