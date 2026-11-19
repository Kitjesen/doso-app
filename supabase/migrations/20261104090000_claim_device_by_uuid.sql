create or replace function public.claim_device_with_digest(
  p_user_id uuid,
  p_device_id uuid,
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
  where id = p_device_id and not is_demo
  for update;

  if v_device.id is null or
     (v_device.owner_id is not null and v_device.owner_id <> p_user_id) then
    return null;
  end if;

  select * into v_claim
  from private.device_claims
  where device_id = v_device.id
  for update;

  if v_claim.id is null or v_claim.consumed_at is not null or
     v_claim.expires_at <= now() or
     v_claim.attempt_count >= v_claim.max_attempts or
     v_claim.code_digest is distinct from p_code_digest then
    if v_claim.id is not null and v_claim.consumed_at is null then
      update private.device_claims
      set attempt_count = attempt_count + 1
      where id = v_claim.id;
    end if;
    return null;
  end if;

  update public.devices
  set owner_id = p_user_id
  where id = v_device.id
  returning * into v_device;

  update private.device_claims
  set consumed_by = p_user_id, consumed_at = now()
  where id = v_claim.id;
  return v_device;
end;
$$;

-- Installed clients retain serial claims while the UUID transaction owns all rules.
create or replace function public.claim_device_with_digest(
  p_user_id uuid,
  p_serial_number text,
  p_code_digest text
)
returns public.devices
language sql
security definer
set search_path = ''
as $$
  select public.claim_device_with_digest(
    p_user_id,
    (select id from public.devices where serial_number = p_serial_number and not is_demo),
    p_code_digest
  );
$$;

revoke all on function public.claim_device_with_digest(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_device_with_digest(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_device_with_digest(uuid, uuid, text) to service_role;
grant execute on function public.claim_device_with_digest(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
