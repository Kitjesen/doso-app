-- History mapping and delivery diagnostics are available only to the backend.
alter table private.telemetry_devices
  add column history_id uuid not null default gen_random_uuid() unique;

drop function public.get_telemetry_history_access(uuid);

create function public.get_telemetry_history_access(
  p_device_id uuid, p_owner_id uuid, p_session_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.devices; v_mapping private.telemetry_devices; v_enabled boolean;
  v_pending bigint; v_failed bigint;
begin
  select * into v_device from public.devices where id=p_device_id for share;
  if p_owner_id is null or p_session_id is null or v_device.id is null
     or v_device.owner_id is distinct from p_owner_id or v_device.is_demo
     or not private.is_account_active_for(p_owner_id)
     or not exists (
       select 1 from public.account_terminals t
       join auth.sessions s on s.id=t.auth_session_id and s.user_id=t.user_id
       where t.user_id=p_owner_id and t.auth_session_id=p_session_id and t.revoked_at is null
     ) then
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
    'authorizationEpoch',v_device.robot_authorization_epoch,'historyId',v_mapping.history_id,'tbDeviceId',v_mapping.tb_device_id,
    'enabled',coalesce(v_enabled and v_mapping.enabled,false),'pendingCount',v_pending,'failedCount',v_failed,
    'droppedCount',coalesce(v_mapping.dropped_count,0));
end;
$$;
revoke all on function public.get_telemetry_history_access(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_telemetry_history_access(uuid,uuid,uuid) to service_role;

-- The local gRPC hop is internal to the report; owners receive robot state only.
create or replace function private.remote_sample_dto(p_value jsonb)
returns jsonb language sql stable set search_path='' as $$
  select case when p_value is null then null else
    jsonb_build_object('observedAt',p_value #>> '{report,observedAt}',
      'receivedAt',p_value->>'receivedAt') ||
    case when p_value #> '{report,status}' is not null
      then jsonb_build_object('status',(p_value #> '{report,status}')-'transport')
      else jsonb_build_object('error',p_value #> '{report,error}') end end;
$$;
notify pgrst,'reload schema';
