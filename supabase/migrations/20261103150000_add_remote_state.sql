create table private.device_remote_state (
  device_id uuid primary key references public.devices(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  authorization_epoch bigint not null check (authorization_epoch between 1 and 9007199254740991),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  enabled boolean not null default false,
  issued boolean not null default false,
  stop_pending boolean not null default false,
  connection_id uuid,
  session_id uuid,
  issued_at timestamptz,
  expires_at timestamptz,
  session_reusable boolean not null default true,
  confirmed_until timestamptz,
  gateway_observed_at timestamptz,
  gateway_reachable boolean not null default false,
  last_seen_at timestamptz,
  last_seq bigint not null default 0 check (last_seq between 0 and 9007199254740991),
  latest jsonb,
  last_success jsonb,
  check (session_id is null or (enabled and connection_id is not null and issued_at is not null and expires_at is not null))
);
revoke all on private.device_remote_state from public,anon,authenticated,service_role;

create function private.remote_time_text(p_time timestamptz)
returns text language sql stable set search_path='' as $$
  select to_char(p_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create function private.remote_time(p_value text)
returns timestamptz language plpgsql stable strict set search_path='' as $$
declare v_time timestamptz;
begin
  if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    raise exception using errcode='22023',message='invalid_remote_state';
  end if;
  v_time := p_value::timestamptz;
  if private.remote_time_text(v_time) <> p_value then
    raise exception using errcode='22023',message='invalid_remote_state';
  end if;
  return v_time;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode='22023',message='invalid_remote_state';
end;
$$;

create function private.remote_uuid(p_value text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false);
$$;

create function private.remote_counter(p_value jsonb)
returns bigint language plpgsql immutable set search_path='' as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number'
     or p_value::text !~ '^[1-9][0-9]{0,15}$' or p_value::numeric > 9007199254740991 then
    raise exception using errcode='22023',message='invalid_remote_state';
  end if;
  return p_value::text::bigint;
end;
$$;

create function private.remote_received(p_value jsonb,p_device_id uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_report jsonb; v_status jsonb; v_observed timestamptz; v_received timestamptz;
begin
  if p_value is null or p_value='null'::jsonb then return null; end if;
  v_report := p_value->'report';
  if jsonb_typeof(p_value) <> 'object' or p_value - array['report','receivedAt'] <> '{}'::jsonb
     or not(p_value ?& array['report','receivedAt']) or jsonb_typeof(p_value->'receivedAt') <> 'string'
     or jsonb_typeof(v_report) <> 'object'
     or v_report - array['v','kind','deviceId','connectionId','reportingSessionId','authorizationEpoch','consentVersion','seq','observedAt','status','error'] <> '{}'::jsonb
     or not(v_report ?& array['v','kind','deviceId','connectionId','reportingSessionId','authorizationEpoch','consentVersion','seq','observedAt'])
     or v_report->'v' is distinct from '1'::jsonb or v_report->>'kind' is distinct from 'status.report'
     or v_report->>'deviceId' is distinct from p_device_id::text
     or not private.remote_uuid(v_report->>'connectionId') or not private.remote_uuid(v_report->>'reportingSessionId')
     or jsonb_typeof(v_report->'observedAt') <> 'string'
     or (v_report ? 'status') = (v_report ? 'error') then
    raise exception using errcode='22023',message='invalid_remote_state';
  end if;
  perform private.remote_counter(v_report->'authorizationEpoch');
  perform private.remote_counter(v_report->'consentVersion');
  perform private.remote_counter(v_report->'seq');
  v_observed := private.remote_time(v_report->>'observedAt');
  v_received := private.remote_time(p_value->>'receivedAt');
  if v_observed > clock_timestamp()+interval '2 seconds' or v_received > clock_timestamp()+interval '2 seconds'
     or v_received < v_observed-interval '2 seconds' then
    raise exception using errcode='22023',message='invalid_remote_state';
  end if;
  if v_report ? 'error' then
    if v_report->>'error' is distinct from 'upstream_unavailable' then
      raise exception using errcode='22023',message='invalid_remote_state';
    end if;
  else
    v_status := v_report->'status';
    if jsonb_typeof(v_status) <> 'object' or not(v_status ?& array['state','control','transport'])
       or v_status - array['state','control','transport'] <> '{}'::jsonb
       or jsonb_typeof(v_status->'state') <> 'object'
       or not((v_status->'state') ?& array['kind','transition'])
       or (v_status->'state') - array['kind','transition'] <> '{}'::jsonb
       or jsonb_typeof(v_status #> '{state,kind}') <> 'string'
       or jsonb_typeof(v_status #> '{state,transition}') <> 'string'
       or (v_status #>> '{state,kind}') not in ('CMS_STATE_KIND_ZERO','CMS_STATE_KIND_GROUNDED','CMS_STATE_KIND_STANDING','CMS_STATE_KIND_WALKING','CMS_STATE_KIND_TRANSITIONING')
       or (v_status #>> '{state,transition}') not in ('CMS_TRANSITION_KIND_NONE','CMS_TRANSITION_KIND_STAND_UP','CMS_TRANSITION_KIND_SIT_DOWN','CMS_TRANSITION_KIND_GESTURE')
       or jsonb_typeof(v_status->'control') <> 'object'
       or not((v_status->'control') ?& array['owner','motorOutputEnabled','criticalMotorFault'])
       or (v_status->'control') - array['owner','motorOutputEnabled','criticalMotorFault'] <> '{}'::jsonb
       or jsonb_typeof(v_status #> '{control,owner}') <> 'string'
       or (v_status #>> '{control,owner}') not in ('CONTROL_OWNER_NONE','CONTROL_OWNER_GRPC','CONTROL_OWNER_YUNZHUO')
       or jsonb_typeof(v_status #> '{control,motorOutputEnabled}') <> 'boolean'
       or jsonb_typeof(v_status #> '{control,criticalMotorFault}') <> 'boolean'
       or jsonb_typeof(v_status->'transport') <> 'string' or v_status->>'transport' not in ('local-insecure','mtls') then
      raise exception using errcode='22023',message='invalid_remote_state';
    end if;
  end if;
  return p_value;
end;
$$;

create function private.remote_observation(p_value jsonb)
returns void language plpgsql stable set search_path='' as $$
declare v_decision jsonb; v_time timestamptz;
begin
  if jsonb_typeof(p_value) <> 'object'
     or p_value - array['deviceId','connectionId','lastSeenAt','reachable','permission','latest','sessionReusable'] <> '{}'::jsonb
     or not(p_value ?& array['deviceId','connectionId','lastSeenAt','reachable','permission','latest','sessionReusable'])
     or not private.remote_uuid(p_value->>'deviceId')
     or jsonb_typeof(p_value->'reachable') <> 'boolean' or jsonb_typeof(p_value->'sessionReusable') <> 'boolean'
     or (p_value->'connectionId' <> 'null'::jsonb and not private.remote_uuid(p_value->>'connectionId')) then
    raise exception using errcode='22023',message='invalid_remote_state';
  end if;
  if p_value->'lastSeenAt' <> 'null'::jsonb then
    if jsonb_typeof(p_value->'lastSeenAt') <> 'string' then
      raise exception using errcode='22023',message='invalid_remote_state';
    end if;
    v_time := private.remote_time(p_value->>'lastSeenAt');
    if v_time > clock_timestamp()+interval '2 seconds' then
      raise exception using errcode='22023',message='invalid_remote_state';
    end if;
  end if;
  v_decision := p_value->'permission';
  if v_decision <> 'null'::jsonb then
    if jsonb_typeof(v_decision) <> 'object'
       or v_decision - array['authorizationEpoch','consentVersion','desiredEnabled','deviceConfirmed','reportingSessionId','expiresAt'] <> '{}'::jsonb
       or not(v_decision ?& array['authorizationEpoch','consentVersion','desiredEnabled','deviceConfirmed','reportingSessionId','expiresAt'])
       or jsonb_typeof(v_decision->'desiredEnabled') <> 'boolean'
       or jsonb_typeof(v_decision->'deviceConfirmed') <> 'boolean'
       or (v_decision->'reportingSessionId' <> 'null'::jsonb and not private.remote_uuid(v_decision->>'reportingSessionId')) then
      raise exception using errcode='22023',message='invalid_remote_state';
    end if;
    perform private.remote_counter(v_decision->'authorizationEpoch');
    perform private.remote_counter(v_decision->'consentVersion');
    if v_decision->'expiresAt' <> 'null'::jsonb then
      if jsonb_typeof(v_decision->'expiresAt') <> 'string' then
        raise exception using errcode='22023',message='invalid_remote_state';
      end if;
      perform private.remote_time(v_decision->>'expiresAt');
    end if;
  end if;
  perform private.remote_received(p_value->'latest',(p_value->>'deviceId')::uuid);
end;
$$;

create function private.lock_remote_state(p_device public.devices)
returns private.device_remote_state language plpgsql security definer set search_path='' as $$
declare v_state private.device_remote_state;
begin
  select * into v_state from private.device_remote_state where device_id=p_device.id for update;
  if v_state.device_id is not null and
     (v_state.owner_id is distinct from p_device.owner_id or v_state.authorization_epoch <> p_device.robot_authorization_epoch) then
    delete from private.device_remote_state where device_id=p_device.id;
    v_state := null;
  end if;
  if v_state.device_id is null then
    insert into private.device_remote_state(device_id,owner_id,authorization_epoch)
    values(p_device.id,p_device.owner_id,p_device.robot_authorization_epoch) returning * into v_state;
  end if;
  return v_state;
end;
$$;

create function private.reset_remote_state_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_demo then
    delete from private.device_remote_state where device_id=new.id;
  else
    perform private.lock_remote_state(new);
  end if;
  return new;
end;
$$;
create trigger device_remote_state_owner after insert or update of owner_id,robot_authorization_epoch,is_demo
on public.devices for each row execute function private.reset_remote_state_owner();

create function private.remote_sample_dto(p_value jsonb)
returns jsonb language sql stable set search_path='' as $$
  select case when p_value is null then null else
    jsonb_strip_nulls(jsonb_build_object('observedAt',p_value #>> '{report,observedAt}',
      'receivedAt',p_value->>'receivedAt','status',p_value #> '{report,status}','error',p_value #> '{report,error}')) end;
$$;

create function private.remote_state_dto(p_state private.device_remote_state)
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
  return jsonb_build_object('deviceId',p_state.device_id,'enabled',p_state.enabled,'revision',p_state.revision,
    'activation',case when not p_state.enabled then case when p_state.stop_pending then 'disabling' else 'off' end
      when not v_reachable then 'unavailable' when v_on then 'on' else 'enabling' end,
    'reachable',v_reachable,'fresh',v_fresh,'lastSeenAt',private.remote_time_text(p_state.last_seen_at),
    'latest',private.remote_sample_dto(p_state.latest),'lastSuccess',private.remote_sample_dto(p_state.last_success));
end;
$$;

create function public.get_remote_state(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.devices;
begin
  if auth.uid() is null or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='remote_state_access_denied';
  end if;
  select * into v_device from public.devices where id=p_device_id for update;
  if v_device.id is null or v_device.owner_id is distinct from auth.uid() or v_device.is_demo
     or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='remote_state_access_denied';
  end if;
  return private.remote_state_dto(private.lock_remote_state(v_device));
end;
$$;

create function public.set_remote_state(p_device_id uuid,p_enabled boolean,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.devices; v_state private.device_remote_state;
begin
  if auth.uid() is null or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='remote_state_access_denied';
  end if;
  if p_enabled is null or p_revision is null or p_revision not between 1 and 9007199254740991 then
    raise exception using errcode='22023',message='invalid_remote_state';
  end if;
  select * into v_device from public.devices where id=p_device_id for update;
  if v_device.id is null or v_device.owner_id is distinct from auth.uid() or v_device.is_demo
     or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='remote_state_access_denied';
  end if;
  v_state := private.lock_remote_state(v_device);
  if p_revision <> v_state.revision then raise exception using errcode='40001',message='remote_state_revision_conflict'; end if;
  if p_enabled <> v_state.enabled then
    -- Reserve the final version for revoking an existing collection grant.
    if v_state.revision=9007199254740991 or (p_enabled and v_state.revision>=9007199254740990) then
      raise exception using errcode='54000',message='remote_state_revision_exhausted';
    end if;
    update private.device_remote_state set enabled=p_enabled,revision=revision+1,
      stop_pending=not p_enabled and issued,session_id=null,issued_at=null,expires_at=null,
      session_reusable=true,confirmed_until=null,last_seq=0,
      gateway_reachable=case when p_enabled then gateway_reachable else false end,
      last_seen_at=case when p_enabled then last_seen_at else null end,
      latest=case when p_enabled then latest else null end
    where device_id=p_device_id returning * into v_state;
  end if;
  return private.remote_state_dto(v_state);
end;
$$;

create function public.sync_remote_state(p_observed_at timestamptz,p_devices jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_item jsonb; v_device_id uuid; v_device public.devices; v_state private.device_remote_state;
  v_permissions jsonb := '[]'::jsonb; v_seen uuid[] := array[]::uuid[];
  v_now timestamptz; v_connection uuid; v_last_seen timestamptz; v_decision jsonb; v_received jsonb;
  v_decision_expiry timestamptz; v_matches boolean; v_reachable boolean; v_permission jsonb; v_seq bigint;
begin
  v_now := clock_timestamp();
  if p_observed_at is null or p_observed_at < v_now-interval '15 seconds' or p_observed_at > v_now+interval '2 seconds'
     or p_devices is null or jsonb_typeof(p_devices) <> 'array' or jsonb_array_length(p_devices)>32
     or octet_length(p_devices::text)>131072 then
    raise exception using errcode='22023',message='invalid_remote_state_batch';
  end if;
  for v_item in select value from jsonb_array_elements(p_devices) order by value->>'deviceId' loop
    if not private.remote_uuid(v_item->>'deviceId') then continue; end if;
    v_device_id := (v_item->>'deviceId')::uuid;
    if v_device_id=any(v_seen) then continue; end if;
    v_seen := array_append(v_seen,v_device_id);
    v_permission := null;
    begin
      if (select count(*) from jsonb_array_elements(p_devices) where value->>'deviceId'=v_device_id::text)>1 then
        raise exception using errcode='22023',message='invalid_remote_state';
      end if;
      perform private.remote_observation(v_item);
      select * into v_device from public.devices where id=v_device_id and not is_demo for update;
      if v_device.id is null then raise exception using errcode='42501',message='remote_state_access_denied'; end if;
      v_state := private.lock_remote_state(v_device);
      if v_state.gateway_observed_at is not null and p_observed_at<=v_state.gateway_observed_at then
        raise exception using errcode='22023',message='stale_remote_state';
      end if;
      if not coalesce(private.is_account_active_for(v_device.owner_id),false) and v_state.enabled then
        update private.device_remote_state set enabled=false,
          revision=least(revision+1,9007199254740991),stop_pending=issued,session_id=null,issued_at=null,
          expires_at=null,confirmed_until=null,session_reusable=true,last_seq=0,
          gateway_reachable=false,last_seen_at=null,latest=null
        where device_id=v_device_id returning * into v_state;
      end if;
      v_now := clock_timestamp();
      v_connection := (v_item->>'connectionId')::uuid;
      v_last_seen := case when v_item->>'lastSeenAt' is null then null else private.remote_time(v_item->>'lastSeenAt') end;
      v_reachable := coalesce((v_item->>'reachable')::boolean and v_connection is not null
        and v_last_seen >= v_now-interval '15 seconds',false);
      if v_connection is distinct from v_state.connection_id and v_connection is not null then
        if v_last_seen is null or (v_state.last_seen_at is not null and v_last_seen<=v_state.last_seen_at) then
          raise exception using errcode='22023',message='stale_remote_state_connection';
        end if;
        update private.device_remote_state set connection_id=v_connection,session_id=null,issued_at=null,
          expires_at=null,session_reusable=true,confirmed_until=null,last_seq=0,latest=null
        where device_id=v_device_id returning * into v_state;
      end if;
      update private.device_remote_state set gateway_observed_at=p_observed_at,
        gateway_reachable=enabled and v_reachable,
        last_seen_at=case when enabled then greatest(last_seen_at,v_last_seen) else null end,
        latest=case when enabled then latest else null end
      where device_id=v_device_id returning * into v_state;
      v_decision := v_item->'permission';
      v_decision_expiry := case when v_decision->>'expiresAt' is null then null else private.remote_time(v_decision->>'expiresAt') end;
      v_matches := coalesce(v_decision->>'authorizationEpoch'=v_state.authorization_epoch::text
        and v_decision->>'consentVersion'=v_state.revision::text
        and (v_decision->>'desiredEnabled')::boolean=v_state.enabled
        and v_connection is not distinct from v_state.connection_id,false);
      if not v_state.enabled then
        if v_matches and (v_decision->>'deviceConfirmed')::boolean and v_decision->>'reportingSessionId' is null
           and v_decision_expiry>v_now and v_state.expires_at is not null and v_decision_expiry<=v_state.expires_at then
          update private.device_remote_state set stop_pending=false,issued=false where device_id=v_device_id returning * into v_state;
          v_permission := null;
        else
          if v_state.expires_at is null or v_state.expires_at<=v_now+interval '15 seconds' then
            update private.device_remote_state set expires_at=date_trunc('milliseconds',v_now)+interval '30 seconds'
            where device_id=v_device_id returning * into v_state;
          end if;
          v_permission := jsonb_build_object('authorizationEpoch',v_state.authorization_epoch,'consentVersion',v_state.revision,
            'enabled',false,'connectionId',v_state.connection_id,'reportingSessionId',null,'expiresAt',private.remote_time_text(v_state.expires_at));
        end if;
      elsif v_reachable and v_connection=v_state.connection_id and v_state.revision<9007199254740991 then
        if v_state.session_id is null or v_state.expires_at<=v_now then
          update private.device_remote_state set session_id=gen_random_uuid(),issued_at=v_now,
            expires_at=date_trunc('milliseconds',v_now)+interval '30 seconds',session_reusable=true,confirmed_until=null,
            last_seq=0,latest=null,issued=true
          where device_id=v_device_id returning * into v_state;
          v_matches := false;
        else
          v_matches := v_matches and v_decision->>'reportingSessionId'=v_state.session_id::text;
          if coalesce(v_matches,false) and not (v_item->>'sessionReusable')::boolean then
            update private.device_remote_state set session_reusable=false where device_id=v_device_id returning * into v_state;
          end if;
          if coalesce(v_matches,false) and v_state.session_reusable and v_decision_expiry>v_now
             and v_decision_expiry<=v_state.expires_at then
            if (v_decision->>'deviceConfirmed')::boolean then
              update private.device_remote_state set confirmed_until=greatest(confirmed_until,v_decision_expiry)
              where device_id=v_device_id returning * into v_state;
            end if;
            if (v_decision->>'deviceConfirmed')::boolean and v_state.confirmed_until>v_now
               and v_decision_expiry=v_state.expires_at
               and v_state.expires_at<=v_now+interval '15 seconds' then
              update private.device_remote_state set expires_at=date_trunc('milliseconds',v_now)+interval '30 seconds'
              where device_id=v_device_id returning * into v_state;
            end if;
          end if;
        end if;
        v_received := private.remote_received(v_item->'latest',v_device_id);
        if v_state.session_reusable and v_received is not null
           and v_received #>> '{report,authorizationEpoch}'=v_state.authorization_epoch::text
           and v_received #>> '{report,consentVersion}'=v_state.revision::text
           and v_received #>> '{report,connectionId}'=v_state.connection_id::text
           and v_received #>> '{report,reportingSessionId}'=v_state.session_id::text then
          v_seq := private.remote_counter(v_received #> '{report,seq}');
          if v_seq>v_state.last_seq
             and private.remote_time(v_received #>> '{report,observedAt}')>=greatest(v_state.issued_at-interval '2 seconds',v_now-interval '15 seconds')
             and private.remote_time(v_received->>'receivedAt')>=greatest(v_state.issued_at-interval '2 seconds',v_now-interval '15 seconds')
             and (v_state.latest is null or
               (private.remote_time(v_received->>'receivedAt')>=private.remote_time(v_state.latest->>'receivedAt')
                and private.remote_time(v_received #>> '{report,observedAt}')>=private.remote_time(v_state.latest #>> '{report,observedAt}'))) then
            update private.device_remote_state set latest=v_received,last_seq=v_seq,
              last_success=case when v_received #> '{report,status}' is not null then v_received else last_success end
            where device_id=v_device_id returning * into v_state;
          end if;
        end if;
        if v_state.session_reusable then
          v_permission := jsonb_build_object('authorizationEpoch',v_state.authorization_epoch,'consentVersion',v_state.revision,
            'enabled',true,'connectionId',v_state.connection_id,'reportingSessionId',v_state.session_id,'expiresAt',private.remote_time_text(v_state.expires_at));
        end if;
      end if;
    exception when sqlstate '22023' or insufficient_privilege then
      v_permission := null;
    end;
    v_permissions := v_permissions || jsonb_build_array(jsonb_build_object('deviceId',v_device_id,'permission',v_permission));
  end loop;
  return jsonb_build_object('v',1,'permissions',v_permissions);
end;
$$;

revoke all on function private.remote_time_text(timestamptz) from public,anon,authenticated,service_role;
revoke all on function private.remote_time(text) from public,anon,authenticated,service_role;
revoke all on function private.remote_uuid(text) from public,anon,authenticated,service_role;
revoke all on function private.remote_counter(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.remote_received(jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function private.remote_observation(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.lock_remote_state(public.devices) from public,anon,authenticated,service_role;
revoke all on function private.reset_remote_state_owner() from public,anon,authenticated,service_role;
revoke all on function private.remote_sample_dto(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.remote_state_dto(private.device_remote_state) from public,anon,authenticated,service_role;
revoke all on function public.get_remote_state(uuid) from public,anon,authenticated,service_role;
revoke all on function public.set_remote_state(uuid,boolean,bigint) from public,anon,authenticated,service_role;
revoke all on function public.sync_remote_state(timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_remote_state(uuid) to authenticated;
grant execute on function public.set_remote_state(uuid,boolean,bigint) to authenticated;
grant execute on function public.sync_remote_state(timestamptz,jsonb) to service_role;
