drop policy if exists "audit_logs_select_related" on public.audit_logs;

revoke select on table public.audit_logs from authenticated;

alter table public.devices
  drop constraint if exists devices_owner_id_fkey,
  add constraint devices_owner_id_fkey
    foreign key (owner_id) references auth.users(id) on delete set null;

create unique index devices_one_physical_per_owner_idx
  on public.devices(owner_id)
  where owner_id is not null and not is_demo;

create or replace function public.claim_device_with_digest(
  p_user_id uuid,
  p_serial_number text,
  p_code_digest text
)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices;
  v_claim private.device_claims;
begin
  if not private.is_account_active_for(p_user_id) then
    raise exception 'account is not active';
  end if;

  select * into v_device
  from public.devices
  where serial_number = p_serial_number and not is_demo
  for update;

  if v_device.id is null or
     (v_device.owner_id is not null and v_device.owner_id <> p_user_id) then
    return null;
  end if;

  if exists (
    select 1 from public.devices
    where owner_id = p_user_id and not is_demo and id <> v_device.id
  ) then
    raise exception 'account already has a bound physical device';
  end if;

  select * into v_claim
  from private.device_claims
  where device_id = v_device.id
  for update;

  if v_claim.id is null or v_claim.consumed_at is not null or
     v_claim.expires_at <= now() or
     v_claim.attempt_count >= v_claim.max_attempts or
     v_claim.code_digest <> p_code_digest then
    if v_claim.id is not null and v_claim.consumed_at is null then
      update private.device_claims
      set attempt_count = attempt_count + 1
      where id = v_claim.id;
    end if;
    return null;
  end if;

  begin
    update public.devices
    set owner_id = p_user_id
    where id = v_device.id
    returning * into v_device;
  exception when unique_violation then
    raise exception 'account already has a bound physical device';
  end;

  update private.device_claims
  set consumed_by = p_user_id, consumed_at = now()
  where id = v_claim.id;
  return v_device;
end;
$$;

comment on table public.audit_logs is
  'Append-only security and administration audit trail. Read access is restricted to the service role and authorized admin Edge Functions.';
