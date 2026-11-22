create or replace function public.admin_issue_factory_claim(
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
declare
  v_device public.devices;
begin
  perform private.require_device_admin(p_actor_user_id);
  -- Share the device-first lock order used by claim_device_with_digest.
  select * into v_device from public.devices where id = p_device_id for update;
  if not found then return false; end if;
  if v_device.owner_id is not null or v_device.is_demo then
    raise exception 'factory_device_unavailable';
  end if;

  return public.admin_rotate_device_claim(
    p_actor_user_id, p_device_id, p_code_digest, p_expires_at, p_reason, p_request_id
  );
end;
$$;

revoke all on function public.admin_issue_factory_claim(uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.admin_issue_factory_claim(uuid, uuid, text, timestamptz, text, text) to service_role;

notify pgrst, 'reload schema';
