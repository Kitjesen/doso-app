-- WGS84 GNSS is optional; existing status senders and saved observations remain valid.
create or replace function private.remote_received(p_value jsonb,p_device_id uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_report jsonb; v_status jsonb; v_location jsonb; v_observed timestamptz; v_received timestamptz;
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
       or v_status - array['state','control','transport','location'] <> '{}'::jsonb
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
    if v_status ? 'location' then
      v_location := v_status->'location';
      if jsonb_typeof(v_location) <> 'object'
         or not(v_location ?& array['lat','lon','fixType','observedAt','accuracyM'])
         or v_location - array['lat','lon','fixType','observedAt','accuracyM'] <> '{}'::jsonb
         or jsonb_typeof(v_location->'lat') <> 'number'
         or jsonb_typeof(v_location->'lon') <> 'number'
         or jsonb_typeof(v_location->'fixType') <> 'number'
         or jsonb_typeof(v_location->'observedAt') <> 'string'
         or jsonb_typeof(v_location->'accuracyM') not in ('number','null') then
        raise exception using errcode='22023',message='invalid_remote_state';
      end if;
      if (v_location->>'lat')::numeric not between -90 and 90
         or (v_location->>'lon')::numeric not between -180 and 180
         or (v_location->>'fixType')::numeric not in (1,2,3,4,5,6,7,8)
         or (v_location->'accuracyM' <> 'null'::jsonb and (v_location->>'accuracyM')::numeric not between 0 and 100000)
         or private.remote_time(v_location->>'observedAt') > v_observed+interval '2 seconds' then
        raise exception using errcode='22023',message='invalid_remote_state';
      end if;
    end if;
  end if;
  return p_value;
end;
$$;

-- Preserve nested accuracyM=null; stripping nulls recursively loses unknown accuracy.
create or replace function private.remote_sample_dto(p_value jsonb)
returns jsonb language sql stable set search_path='' as $$
  select case when p_value is null then null else
    jsonb_build_object('observedAt',p_value #>> '{report,observedAt}',
      'receivedAt',p_value->>'receivedAt') ||
    case when p_value #> '{report,status}' is not null
      then jsonb_build_object('status',p_value #> '{report,status}')
      else jsonb_build_object('error',p_value #> '{report,error}') end end;
$$;

notify pgrst, 'reload schema';
