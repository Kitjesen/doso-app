create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  model_code text not null,
  display_name text not null,
  category text not null,
  environment text not null,
  serial_number text,
  connection_status text not null default 'offline'
    check (connection_status in ('offline', 'connecting', 'online', 'error')),
  safety_lock boolean not null default true,
  alerts_enabled boolean not null default true,
  battery_percent smallint
    check (battery_percent between 0 and 100),
  firmware_version text,
  runtime_hours numeric(12, 2) not null default 0
    check (runtime_hours >= 0),
  last_seen_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index devices_serial_number_key
  on public.devices(serial_number)
  where serial_number is not null;

create index devices_owner_id_idx on public.devices(owner_id);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger devices_set_updated_at
before update on public.devices
for each row execute function private.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = case
        when excluded.display_name = '' then public.profiles.display_name
        else excluded.display_name
      end,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.devices enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "devices_select_own"
on public.devices
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "devices_insert_own"
on public.devices
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "devices_update_own"
on public.devices
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "devices_delete_own"
on public.devices
for delete
to authenticated
using (owner_id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.devices from anon, authenticated;
grant select, update (display_name, avatar_url) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.devices to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;

comment on table public.profiles is 'DOSO account profile owned by an auth.users identity.';
comment on table public.devices is 'Physical or onboarding demo robots owned by one DOSO account.';
comment on column public.devices.is_demo is 'True for an onboarding model selection; false only after physical binding.';
