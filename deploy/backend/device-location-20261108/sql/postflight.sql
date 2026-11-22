\set ON_ERROR_STOP on
do $$
declare
  device uuid := '11111111-1111-4111-8111-111111111111';
  stamp text := private.remote_time_text(clock_timestamp());
  status jsonb := '{"state":{"kind":"CMS_STATE_KIND_STANDING","transition":"CMS_TRANSITION_KIND_NONE"},"control":{"owner":"CONTROL_OWNER_NONE","motorOutputEnabled":false,"criticalMotorFault":false},"transport":"mtls"}';
  location jsonb;
  sample jsonb;
  candidate jsonb;
  invalid jsonb;
  rejected boolean;
begin
  location := jsonb_build_object('lat',31.2304,'lon',121.4737,'fixType',1,
    'accuracyM',null,'observedAt',stamp);
  sample := jsonb_build_object('receivedAt',stamp,'report',jsonb_build_object(
    'v',1,'kind','status.report','deviceId',device,
    'connectionId',device,'reportingSessionId',device,
    'authorizationEpoch',1,'consentVersion',1,'seq',1,
    'observedAt',stamp,'status',status));
  if private.remote_received(sample,device) is distinct from sample then
    raise exception 'legacy status changed';
  end if;
  candidate := jsonb_set(sample,'{report,status,location}',location);
  if private.remote_received(candidate,device) is distinct from candidate
     or private.remote_sample_dto(candidate)#>'{status,location}' is distinct from location then
    raise exception 'location or fix time not preserved';
  end if;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    'null'::jsonb,
    location || '{"lat":91}', location || '{"lon":-181}',
    location || '{"lat":"31"}', location || '{"fixType":0}',
    location || '{"fixType":1.5}', location || '{"accuracyM":-1}',
    location || '{"accuracyM":100001}', location || '{"extra":true}',
    location || jsonb_build_object('observedAt',private.remote_time_text(clock_timestamp()+interval '10 seconds'))
  )) loop
    rejected := false;
    begin
      perform private.remote_received(jsonb_set(sample,'{report,status,location}',invalid),device);
    exception when invalid_parameter_value then rejected := true;
    end;
    if not rejected then raise exception 'invalid location accepted: %',invalid; end if;
  end loop;
end;
$$;
select 'PASS remote location preserves old status, validates WGS84 and keeps fix time';

\echo PASS device_location_readonly_postflight
