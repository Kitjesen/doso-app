create or replace function private.require_device_admin(p_actor_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.profiles
  where id = p_actor_user_id and app_role = 'admin' and account_status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'device_admin_required';
  end if;
end;
$$;

create or replace function public.create_device_inventory(
  p_actor_user_id uuid,
  p_serial_number text,
  p_model_code text,
  p_display_name text,
  p_category text,
  p_environment text,
  p_reason text,
  p_request_id text
)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices;
  v_serial_number text := upper(btrim(p_serial_number));
  v_model_code text := btrim(p_model_code);
begin
  perform private.require_device_admin(p_actor_user_id);
  if v_serial_number is null or length(v_serial_number) not between 1 and 100
     or v_model_code is null or length(v_model_code) not between 1 and 100
     or p_display_name is null or length(p_display_name) > 100
     or p_category is null or p_category not in ('四足', '轮式')
     or p_environment is null or p_environment not in ('室内', '室外')
     or p_reason is null or length(p_reason) > 500
     or p_request_id is null or length(btrim(p_request_id)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid_inventory_values';
  end if;

  insert into public.devices (
    owner_id, model_code, display_name, category, environment,
    serial_number, connection_status, is_demo
  ) values (
    null, v_model_code, p_display_name, p_category, p_environment,
    v_serial_number, 'offline', false
  )
  on conflict (serial_number) where serial_number is not null do nothing
  returning * into v_device;

  if v_device.id is null then
    raise exception using errcode = '23505', message = 'serial_exists';
  end if;

  insert into public.audit_logs (
    actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_actor_user_id, 'device.inventory_created', 'device', v_device.id::text,
    jsonb_build_object(
      'serialNumber', v_serial_number, 'reason', p_reason,
      'actorRole', 'admin', 'outcome', 'success', 'requestId', btrim(p_request_id)
    )
  );
  return v_device;
end;
$$;

create or replace function public.admin_rotate_device_claim(
  p_actor_user_id uuid,
  p_device_id uuid,
  p_code_digest text,
  p_expires_at timestamptz,
  p_reason text,
  p_request_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_device_admin(p_actor_user_id);
  if p_code_digest is null or length(p_code_digest) not between 32 and 512
     or p_expires_at is null or p_expires_at <= now()
     or p_reason is null or length(p_reason) > 500
     or p_request_id is null or length(btrim(p_request_id)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid_device_claim_values';
  end if;

  perform 1 from public.devices where id = p_device_id for update;
  if not found then return false; end if;

  perform public.rotate_device_claim(p_device_id, p_code_digest, p_expires_at);
  insert into public.audit_logs (
    actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_actor_user_id, 'device.binding_code_rotated', 'device', p_device_id::text,
    jsonb_build_object(
      'expiresAt', p_expires_at, 'reason', p_reason,
      'actorRole', 'admin', 'outcome', 'success', 'requestId', btrim(p_request_id)
    )
  );
  return true;
end;
$$;

create or replace function public.admin_unbind_device(
  p_actor_user_id uuid,
  p_device_id uuid,
  p_reason text,
  p_request_id text
)
returns public.devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices;
begin
  perform private.require_device_admin(p_actor_user_id);
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500
     or p_request_id is null or length(btrim(p_request_id)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid_device_unbind_values';
  end if;

  v_device := public.unbind_device(p_device_id, null, true);
  if v_device.id is null then return null; end if;
  insert into public.audit_logs (
    actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    p_actor_user_id, 'device.force_unbind', 'device', p_device_id::text,
    jsonb_build_object(
      'reason', p_reason, 'actorRole', 'admin', 'outcome', 'success',
      'requestId', btrim(p_request_id)
    )
  );
  return v_device;
end;
$$;

revoke all on function private.require_device_admin(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_device_inventory(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_rotate_device_claim(uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.admin_unbind_device(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_device_inventory(uuid, text, text, text, text, text, text, text) to service_role;
grant execute on function public.admin_rotate_device_claim(uuid, uuid, text, timestamptz, text, text) to service_role;
grant execute on function public.admin_unbind_device(uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
