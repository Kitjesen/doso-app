alter table public.profiles
  add column username_claimed_at timestamptz;

-- Every profile that predates this migration already owns its canonical
-- username. Mark those rows before changing the signup behavior.
update public.profiles
set username_claimed_at = coalesce(created_at, now());

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
  v_username_claimed_at timestamptz;
  v_display_name text;
  v_base text;
  v_suffix text;
  v_counter integer;
  v_is_email_registration boolean;
begin
  select profiles.username, profiles.username_claimed_at
  into v_existing_username, v_existing_claimed_at
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
  v_is_email_registration := coalesce(new.raw_app_meta_data ->> 'provider', '') = 'email';

  -- This trigger also runs for user-editable metadata updates. Once a profile
  -- exists, neither its username nor its claim marker can be changed here.
  if v_existing_username is not null then
    v_username := v_existing_username;
    v_username_claimed_at := v_existing_claimed_at;
  elsif v_is_email_registration and v_raw_username is not null then
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
      raise exception using
        errcode = '22023',
        message = 'username is reserved';
    end if;

    v_username_claimed_at := pg_catalog.clock_timestamp();
  else
    -- Provider metadata is not authoritative for social identities. Allocate
    -- a deterministic provisional name and leave the profile unclaimed.
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
  end if;

  insert into public.profiles (
    id, email, username, username_claimed_at, display_name, avatar_url
  )
  values (
    new.id,
    coalesce(new.email, ''),
    v_username,
    v_username_claimed_at,
    v_display_name,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      username = public.profiles.username,
      username_claimed_at = public.profiles.username_claimed_at,
      display_name = case
        when excluded.display_name = '' then public.profiles.display_name
        else excluded.display_name
      end,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

create function public.claim_username(p_username text)
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

  select profiles.username, profiles.username_claimed_at
  into v_current_username, v_claimed_at
  from public.profiles as profiles
  where profiles.id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  if v_claimed_at is not null then
    if v_current_username = v_username then
      return v_current_username;
    end if;

    raise exception using errcode = 'P0001', message = 'username_already_claimed';
  end if;

  begin
    update public.profiles
    set username = v_username,
        username_claimed_at = pg_catalog.clock_timestamp()
    where id = v_user_id;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'username_taken';
  end;

  return v_username;
end;
$$;

revoke all on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;

comment on column public.profiles.username_claimed_at is
  'Server-owned timestamp set when the canonical username is permanently claimed.';

comment on function public.claim_username(text) is
  'Atomically claims one canonical username for the current active authenticated session; the operation is single-use and idempotent for the same value.';
