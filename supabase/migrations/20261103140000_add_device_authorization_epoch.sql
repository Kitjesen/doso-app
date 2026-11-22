alter table public.devices
  add column if not exists robot_authorization_epoch bigint not null default 1
    check (robot_authorization_epoch >= 1);

create or replace function private.enforce_device_authorization_epoch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.owner_id is distinct from old.owner_id
      or new.robot_authorization_epoch is distinct from old.robot_authorization_epoch)
     and current_user <> 'postgres' then
    raise exception 'trusted robot state is RPC-only' using errcode = '42501';
  end if;
  if new.owner_id is distinct from old.owner_id then
    new.robot_authorization_epoch := old.robot_authorization_epoch + 1;
  elsif new.robot_authorization_epoch < old.robot_authorization_epoch then
    raise exception 'robot authorization epoch cannot roll back';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_device_authorization_epoch() from public,anon,authenticated,service_role;

do $$
declare
  v_full pg_catalog.pg_trigger;
  v_minimal pg_catalog.pg_trigger;
begin
  select * into v_full from pg_catalog.pg_trigger
  where tgrelid = 'public.devices'::regclass and tgname = 'devices_enforce_robot_update';
  select * into v_minimal from pg_catalog.pg_trigger
  where tgrelid = 'public.devices'::regclass and tgname = 'devices_enforce_authorization_epoch';
  if v_full.oid is not null and
     (v_full.tgenabled not in ('O','A')
      or v_full.tgfoid is distinct from to_regprocedure('private.enforce_robot_device_update()')) then
    raise exception 'unexpected devices_enforce_robot_update trigger';
  end if;
  if v_minimal.oid is not null and
     (v_minimal.tgenabled not in ('O','A')
      or v_minimal.tgfoid <> 'private.enforce_device_authorization_epoch()'::regprocedure) then
    raise exception 'unexpected devices_enforce_authorization_epoch trigger';
  end if;
  if v_full.oid is not null then
    drop trigger if exists devices_enforce_authorization_epoch on public.devices;
    drop function private.enforce_device_authorization_epoch();
  elsif v_minimal.oid is null then
    create trigger devices_enforce_authorization_epoch
    before update of owner_id,robot_authorization_epoch on public.devices
    for each row execute function private.enforce_device_authorization_epoch();
  end if;
end;
$$;
