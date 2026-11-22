create function public.get_telemetry_history_access(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.devices; v_mapping private.telemetry_devices; v_enabled boolean;
  v_pending bigint; v_failed bigint;
begin
  if auth.uid() is null or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='remote_history_access_denied';
  end if;
  select * into v_device from public.devices where id=p_device_id for share;
  if v_device.id is null or v_device.owner_id is distinct from auth.uid() or v_device.is_demo
     or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='remote_history_access_denied';
  end if;
  select * into v_mapping from private.telemetry_devices
    where device_id=v_device.id and authorization_epoch=v_device.robot_authorization_epoch;
  if v_mapping.device_id is not null and v_mapping.owner_id is distinct from v_device.owner_id then
    raise exception using errcode='42501',message='remote_history_access_denied';
  end if;
  select enabled into v_enabled from private.device_remote_state where device_id=v_device.id
    and owner_id=v_device.owner_id and authorization_epoch=v_device.robot_authorization_epoch;
  select count(*) filter(where state='pending'),count(*) filter(where state in ('failed','conflict'))
    into v_pending,v_failed from private.telemetry_outbox
    where device_id=v_device.id and authorization_epoch=v_device.robot_authorization_epoch and owner_id=v_device.owner_id;
  return jsonb_build_object('deviceId',v_device.id,'ownerId',v_device.owner_id,'simulated',v_device.is_simulated,
    'authorizationEpoch',v_device.robot_authorization_epoch,'tbDeviceId',v_mapping.tb_device_id,
    'enabled',coalesce(v_enabled and v_mapping.enabled,false),'pendingCount',v_pending,'failedCount',v_failed,
    'droppedCount',coalesce(v_mapping.dropped_count,0));
end;
$$;
revoke all on function public.get_telemetry_history_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_telemetry_history_access(uuid) to authenticated;
notify pgrst,'reload schema';
