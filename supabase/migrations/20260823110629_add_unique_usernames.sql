create function private.normalize_username(p_value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.btrim(p_value)),
      '[^a-z0-9_]+',
      '_',
      'g'
    ),
    '_'
  );
$$;

alter table public.profiles
  add column username text;

do $$
declare
  v_profile record;
  v_base text;
  v_candidate text;
  v_suffix text;
  v_counter integer;
begin
  for v_profile in
    select
      profiles.id,
      profiles.email,
      profiles.display_name,
      users.raw_user_meta_data
    from public.profiles as profiles
    left join auth.users as users on users.id = profiles.id
    order by profiles.created_at, profiles.id
  loop
    v_base := private.normalize_username(
      coalesce(
        nullif(v_profile.raw_user_meta_data ->> 'username', ''),
        nullif(v_profile.display_name, ''),
        nullif(split_part(v_profile.email, '@', 1), ''),
        'user'
      )
    );

    if v_base !~ '^[a-z0-9_]{3,24}$'
       or v_base = any (array[
         'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
         'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
         'register', 'robot', 'robotics', 'root', 'security', 'signup',
         'staff', 'support', 'system', 'undefined'
       ]::text[]) then
      v_base := 'user_' || pg_catalog.substring(pg_catalog.replace(v_profile.id::text, '-', ''), 1, 12);
    end if;

    v_candidate := pg_catalog.left(v_base, 24);
    v_counter := 2;

    while exists (
      select 1
      from public.profiles
      where username = v_candidate
        and id <> v_profile.id
    ) loop
      v_suffix := '_' || v_counter::text;
      v_candidate := pg_catalog.left(v_base, 24 - pg_catalog.length(v_suffix)) || v_suffix;
      v_counter := v_counter + 1;
    end loop;

    update public.profiles
    set username = v_candidate
    where id = v_profile.id;
  end loop;
end;
$$;

alter table public.profiles
  alter column username set not null,
  add constraint profiles_username_format_check
    check (
      username = private.normalize_username(username)
      and username ~ '^[a-z0-9_]{3,24}$'
    ),
  add constraint profiles_username_reserved_check
    check (
      username <> all (array[
        'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
        'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
        'register', 'robot', 'robotics', 'root', 'security', 'signup',
        'staff', 'support', 'system', 'undefined'
      ]::text[])
    );

create unique index profiles_username_key
  on public.profiles (username);

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
  v_display_name text;
  v_base text;
  v_suffix text;
  v_counter integer;
begin
  select profiles.username
  into v_existing_username
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

  -- raw_user_meta_data is user-editable after signup. Once allocated, the
  -- canonical username must not be renameable through auth.updateUser().
  if v_existing_username is not null then
    v_username := v_existing_username;
  elsif v_raw_username is not null then
    v_username := private.normalize_username(v_raw_username);

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
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('doso.username.allocate')
    );

    v_base := private.normalize_username(v_display_name);
    if v_base !~ '^[a-z0-9_]{3,24}$'
       or v_base = any (array[
         'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
         'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
         'register', 'robot', 'robotics', 'root', 'security', 'signup',
         'staff', 'support', 'system', 'undefined'
       ]::text[]) then
      v_base := 'user_' || pg_catalog.substring(pg_catalog.replace(new.id::text, '-', ''), 1, 12);
    end if;

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
  end if;

  insert into public.profiles (id, email, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    v_username,
    v_display_name,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      username = excluded.username,
      display_name = case
        when excluded.display_name = '' then public.profiles.display_name
        else excluded.display_name
      end,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

revoke all on function private.normalize_username(text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

comment on column public.profiles.username is
  'Globally unique canonical DOSO username; lowercase a-z, digits, and underscores only.';
