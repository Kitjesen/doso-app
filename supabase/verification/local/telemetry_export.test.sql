\set ON_ERROR_STOP on
begin;
\ir ../../migrations/20261104100000_create_device_inventory.sql
\ir ../../migrations/20261107100000_add_simulated_devices.sql
\ir ../../migrations/20261108020000_add_telemetry_export.sql

do $$
declare
  device uuid := '99999999-9999-4999-8999-999999999999';
  owner uuid := '11111111-1111-4111-8111-111111111111';
  session uuid := '99999999-9999-4999-8999-999999999998';
  stamp timestamptz := date_trunc('milliseconds',clock_timestamp());
  received jsonb; item jsonb; permission jsonb; batch jsonb; result jsonb; token uuid; delivery uuid;
  epoch bigint; version bigint; before_count bigint; previous_token uuid;
begin
  if has_function_privilege('authenticated','public.claim_telemetry_export()','execute')
     or has_function_privilege('anon','public.configure_telemetry_export(uuid,boolean)','execute')
     or has_table_privilege('service_role','private.telemetry_outbox','select') then
    raise exception 'telemetry privilege leak';
  end if;
  insert into public.devices(id,owner_id,serial_number,model_code,display_name,category,environment,is_simulated)
    values(device,owner,'LOCAL-TELEMETRY','thunder','Local telemetry','quadruped','local',true);
  select robot_authorization_epoch into epoch from public.devices where id=device;
  update private.device_remote_state set enabled=true,revision=2,connection_id=device,session_id=session,
    issued_at=stamp,expires_at=stamp+interval '30 seconds',confirmed_until=stamp+interval '30 seconds'
    where device_id=device;
  version := 2;
  received := jsonb_build_object('receivedAt',private.remote_time_text(stamp),'report',jsonb_build_object(
    'v',1,'kind','status.report','deviceId',device,'connectionId',device,'reportingSessionId',session,
    'authorizationEpoch',epoch,'consentVersion',version,'seq',1,'observedAt',private.remote_time_text(stamp),
    'status',jsonb_build_object('state',jsonb_build_object('kind','CMS_STATE_KIND_STANDING','transition','CMS_TRANSITION_KIND_NONE'),
      'control',jsonb_build_object('owner','CONTROL_OWNER_NONE','motorOutputEnabled',false,'criticalMotorFault',false),
      'transport','mtls','location',jsonb_build_object('lat',31,'lon',121,'fixType',1,'accuracyM',null,'observedAt',private.remote_time_text(stamp)))));
  permission := jsonb_build_object('authorizationEpoch',epoch,'consentVersion',version,'desiredEnabled',true,
    'deviceConfirmed',true,'reportingSessionId',session,'expiresAt',private.remote_time_text(stamp+interval '30 seconds'));
  item := jsonb_build_object('deviceId',device,'connectionId',device,'lastSeenAt',private.remote_time_text(stamp),
    'reachable',true,'sessionReusable',true,'permission',permission,'latest',received);
  perform public.sync_remote_state(stamp,jsonb_build_array(item));
  if exists(select 1 from private.telemetry_outbox) then raise exception 'default export is not off'; end if;
  perform public.configure_telemetry_export(device,true);
  received := jsonb_set(received,'{report,seq}','2');
  item := jsonb_set(item,'{latest}',received);
  perform public.sync_remote_state(stamp+interval '1 millisecond',jsonb_build_array(item));
  perform public.sync_remote_state(stamp+interval '2 milliseconds',jsonb_build_array(item));
  if (select count(*) from private.telemetry_outbox)<>1 then raise exception 'accepted snapshot not queued exactly once'; end if;
  if (select o.received from private.telemetry_outbox o limit 1) is distinct from received then raise exception 'complete received report lost'; end if;
  result := public.claim_telemetry_export();
  delivery := (result#>>'{items,0,id}')::uuid; token := (result#>>'{items,0,leaseToken}')::uuid;
  if delivery is null or result#>'{items,0,simulated}'<>'true'::jsonb then raise exception 'claim missing database identity'; end if;
  if jsonb_array_length(public.claim_telemetry_export()->'items')<>0 then raise exception 'duplicate concurrent lease'; end if;
  if public.check_telemetry_export(delivery,gen_random_uuid(),null)->'allowed'<>'false'::jsonb then raise exception 'wrong token accepted'; end if;
  update private.device_remote_state set expires_at=stamp-interval '1 minute',confirmed_until=stamp-interval '1 minute' where device_id=device;
  if public.check_telemetry_export(delivery,token,device)->'allowed'<>'true'::jsonb then raise exception 'expired source lease incorrectly cancels accepted history'; end if;
  previous_token := token;
  update private.telemetry_outbox set lease_until=clock_timestamp()-interval '1 second' where id=delivery;
  result := public.claim_telemetry_export(); token := (result#>>'{items,0,leaseToken}')::uuid;
  if token is null or token=previous_token or public.check_telemetry_export(delivery,previous_token,null)->'allowed'<>'false'::jsonb then
    raise exception 'expired export lease not fenced';
  end if;
  perform public.finish_telemetry_export(delivery,token,'retry');
  update private.telemetry_outbox set available_at=clock_timestamp()-interval '1 second' where id=delivery;
  result := public.claim_telemetry_export(); token := (result#>>'{items,0,leaseToken}')::uuid;
  if result#>>'{items,0,tbDeviceId}'<>device::text then raise exception 'mapping not saved'; end if;
  perform public.finish_telemetry_export(delivery,token,'delivered');
  if (select state from private.telemetry_outbox where id=delivery)<>'delivered' then raise exception 'completion not saved'; end if;
  -- Rollback of the accepting transaction also rolls back the enqueue trigger.
  before_count := (select count(*) from private.telemetry_outbox);
  begin
    update private.device_remote_state set last_seq=3,latest=jsonb_set(received,'{report,seq}','3') where device_id=device;
    raise exception 'rollback_fixture';
  exception when raise_exception then null;
  end;
  if (select count(*) from private.telemetry_outbox)<>before_count then raise exception 'enqueue survived transaction rollback'; end if;
  update private.device_remote_state set last_seq=3,latest=jsonb_set(received,'{report,seq}','3') where device_id=device;
  result := public.claim_telemetry_export(); delivery := (result#>>'{items,0,id}')::uuid; token := (result#>>'{items,0,leaseToken}')::uuid;
  update private.device_remote_state set enabled=false,revision=revision+1,session_id=null where device_id=device;
  if public.check_telemetry_export(delivery,token,null)->'allowed'<>'false'::jsonb
     or (select state from private.telemetry_outbox where id=delivery)<>'cancelled' then raise exception 'close did not cancel pending'; end if;
  update private.device_remote_state set enabled=true,revision=4,session_id=session,last_seq=0,latest=null where device_id=device;
  received := jsonb_set(jsonb_set(received,'{report,consentVersion}','4'),'{report,seq}','1');
  update private.device_remote_state set last_seq=1,latest=received where device_id=device;
  update private.telemetry_outbox set attempts=19 where state='pending';
  result := public.claim_telemetry_export(); delivery := (result#>>'{items,0,id}')::uuid; token := (result#>>'{items,0,leaseToken}')::uuid;
  perform public.finish_telemetry_export(delivery,token,'retry');
  if (select state from private.telemetry_outbox where id=delivery)<>'failed' then raise exception 'retries are not bounded'; end if;
  update private.device_remote_state set last_seq=2,latest=jsonb_set(received,'{report,seq}','2') where device_id=device;
  update private.telemetry_outbox set created_at=clock_timestamp()-interval '2 days' where state='pending';
  if jsonb_array_length(public.claim_telemetry_export()->'items')<>0 then raise exception 'expired backlog claimed'; end if;
  update private.device_remote_state set last_seq=3,latest=jsonb_set(received,'{report,seq}','3') where device_id=device;
  result := public.claim_telemetry_export(); delivery := (result#>>'{items,0,id}')::uuid; token := (result#>>'{items,0,leaseToken}')::uuid;
  insert into private.telemetry_outbox(device_id,authorization_epoch,owner_id,consent_version,session_id,seq,received,state)
    select device,epoch,owner,4,session,n,jsonb_set(received,'{report,seq}',to_jsonb(n)),'delivered' from generate_series(100,10099) n;
  update private.device_remote_state set last_seq=4,latest=jsonb_set(received,'{report,seq}','4') where device_id=device;
  if (select dropped_count from private.telemetry_devices where device_id=device)<>0 then raise exception 'delivered rows exhausted pending capacity'; end if;
  delete from private.telemetry_outbox where device_id=device and seq>=100;
  insert into private.telemetry_outbox(device_id,authorization_epoch,owner_id,consent_version,session_id,seq,received)
    select device,epoch,owner,4,session,n,jsonb_set(received,'{report,seq}',to_jsonb(n)) from generate_series(100,10097) n;
  update private.device_remote_state set last_seq=5,latest=jsonb_set(received,'{report,seq}','5') where device_id=device;
  if (select dropped_count from private.telemetry_devices where device_id=device)<>1
     or (select count(*) from private.telemetry_outbox where state='pending')<>10000 then raise exception 'pending backlog bound is not visible'; end if;
  update public.devices set owner_id='22222222-2222-4222-8222-222222222222' where id=device;
  if public.check_telemetry_export(delivery,token,null)->'allowed'<>'false'::jsonb
     or (select state from private.telemetry_outbox where id=delivery)<>'cancelled' then raise exception 'new owner inherited old delivery'; end if;
  update public.devices set owner_id=null where id=device;
  perform public.configure_telemetry_export(device,false);
  if exists(select 1 from private.telemetry_devices where device_id=device and enabled) then raise exception 'unowned device cannot pause export'; end if;
end;
$$;
select 'PASS telemetry default off, atomic accepted snapshots, full report, leases, retry cap, TTL, close, owner isolation and privileges';
rollback;
