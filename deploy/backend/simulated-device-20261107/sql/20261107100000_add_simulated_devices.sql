-- Simulation is inventory identity; demo rows remain local UI previews.
alter table public.devices add column is_simulated boolean not null default false;
alter table public.devices add constraint devices_simulation_identity check (not (is_demo and is_simulated));

create function private.keep_simulation_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.is_simulated is distinct from old.is_simulated then
    raise exception using errcode='23514', message='device_simulation_identity_immutable';
  end if;
  return new;
end;
$$;
create trigger device_simulation_identity before update of is_simulated on public.devices
for each row execute function private.keep_simulation_identity();
revoke all on function private.keep_simulation_identity() from public, anon, authenticated, service_role;

create or replace function public.create_device_inventory(
  p_actor_user_id uuid,
  p_serial_number text,
  p_model_code text,
  p_display_name text,
  p_category text,
  p_environment text,
  p_reason text,
  p_request_id text,
  p_is_simulated boolean
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
     or p_is_simulated is null
     or p_request_id is null or length(btrim(p_request_id)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'invalid_inventory_values';
  end if;

  insert into public.devices (
    owner_id, model_code, display_name, category, environment,
    serial_number, connection_status, is_demo, is_simulated
  ) values (
    null, v_model_code, p_display_name, p_category, p_environment,
    v_serial_number, 'offline', false, p_is_simulated
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
      'serialNumber', v_serial_number, 'simulated', p_is_simulated, 'reason', p_reason,
      'actorRole', 'admin', 'outcome', 'success', 'requestId', btrim(p_request_id)
    )
  );
  return v_device;
end;
$$;

create or replace function public.create_device_inventory(
  p_actor_user_id uuid, p_serial_number text, p_model_code text, p_display_name text,
  p_category text, p_environment text, p_reason text, p_request_id text
)
returns public.devices language sql security definer set search_path='' as $$
  select public.create_device_inventory(p_actor_user_id, p_serial_number, p_model_code,
    p_display_name, p_category, p_environment, p_reason, p_request_id, false);
$$;
revoke all on function public.create_device_inventory(uuid,text,text,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_device_inventory(uuid,text,text,text,text,text,text,text,boolean) to service_role;

create or replace function private.remote_state_dto(p_state private.device_remote_state)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_now timestamptz := clock_timestamp(); v_reachable boolean; v_on boolean; v_fresh boolean;
begin
  v_reachable := coalesce(p_state.enabled and p_state.gateway_reachable and p_state.gateway_observed_at >= v_now-interval '15 seconds'
    and p_state.last_seen_at >= v_now-interval '15 seconds',false);
  v_on := coalesce(p_state.enabled and p_state.session_reusable and p_state.expires_at > v_now
    and p_state.confirmed_until > v_now,false);
  v_fresh := coalesce(v_on and v_reachable and p_state.latest #> '{report,status}' is not null
    and p_state.latest #>> '{report,reportingSessionId}'=p_state.session_id::text
    and p_state.latest #>> '{report,connectionId}'=p_state.connection_id::text
    and (p_state.latest #>> '{report,authorizationEpoch}')::bigint=p_state.authorization_epoch
    and (p_state.latest #>> '{report,consentVersion}')::bigint=p_state.revision
    and private.remote_time(p_state.latest #>> '{report,observedAt}') >= v_now-interval '5 seconds'
    and private.remote_time(p_state.latest->>'receivedAt') >= v_now-interval '5 seconds',false);
  return jsonb_build_object('deviceId',p_state.device_id,'simulated',(select is_simulated from public.devices where id=p_state.device_id),'enabled',p_state.enabled,'revision',p_state.revision,
    'activation',case when not p_state.enabled then case when p_state.stop_pending then 'disabling' else 'off' end
      when not v_reachable then 'unavailable' when v_on then 'on' else 'enabling' end,
    'reachable',v_reachable,'fresh',v_fresh,'lastSeenAt',private.remote_time_text(p_state.last_seen_at),
    'latest',private.remote_sample_dto(p_state.latest),'lastSuccess',private.remote_sample_dto(p_state.last_success));
end;
$$;

notify pgrst, 'reload schema';
