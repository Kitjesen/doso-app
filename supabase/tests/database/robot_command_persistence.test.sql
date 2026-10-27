begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

select has_table('public','device_commands','device command projection exists');
select has_table('private','device_command_outbox','private command outbox exists');
select has_table('private','device_command_ack_events','private append-only ACK events exist');
select ok((select relrowsecurity from pg_class where oid='public.device_commands'::regclass),'public commands use RLS');
select ok((select relrowsecurity from pg_class where oid='private.device_command_outbox'::regclass),'private outbox uses defense-in-depth RLS');
select ok((select relrowsecurity from pg_class where oid='private.device_command_ack_events'::regclass),'private ACK events use defense-in-depth RLS');
select ok(has_table_privilege('authenticated','public.device_commands','SELECT')
  and not has_table_privilege('authenticated','public.device_commands','INSERT')
  and not has_table_privilege('authenticated','public.device_commands','UPDATE'),
  'authenticated users only receive command projection SELECT');
select ok(not has_table_privilege('anon','public.device_commands','SELECT')
  and not has_table_privilege('anon','public.device_commands','INSERT'),'anonymous users have no command privileges');
select ok(not has_table_privilege('authenticated','private.device_command_outbox','SELECT')
  and not has_table_privilege('service_role','private.device_command_outbox','SELECT')
  and not has_table_privilege('service_role','private.device_command_ack_events','INSERT'),
  'private robot persistence is RPC-only even for service_role');
select ok(has_function_privilege('authenticated','public.create_robot_health_check(uuid,text,text[],integer)','EXECUTE')
  and not has_function_privilege('anon','public.create_robot_health_check(uuid,text,text[],integer)','EXECUTE'),
  'health-check creation is authenticated-only');
select ok(has_function_privilege('service_role','public.claim_robot_command_for_publish(uuid,integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.claim_robot_command_for_publish(uuid,integer)','EXECUTE'),
  'outbox claim is service-role-only');
select ok(has_function_privilege('service_role','public.get_robot_ingress_context(uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.ingest_verified_robot_ack(jsonb,jsonb,jsonb,text,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.ingest_verified_robot_telemetry(jsonb,jsonb,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.ingest_verified_robot_ack(jsonb,jsonb,jsonb,text,text,text)','EXECUTE'),
  'ingress context and commits are service-role-only');
select ok(has_function_privilege('service_role','public.provision_robot_device_authority(uuid,text,text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.provision_robot_device_authority(uuid,text,text,text,text)','EXECUTE'),
  'robot authority provisioning is service-role-only');
select ok(lower(pg_get_functiondef('public.ingest_verified_robot_ack(jsonb,jsonb,jsonb,text,text,text)'::regprocedure))
  like '%on conflict do nothing%',
  'ACK digest races use atomic insert-on-conflict semantics');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('91111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','robot-owner@doso.test',crypt('StrongPass123',gen_salt('bf')),
 '{"provider":"email","providers":["email"]}','{"username":"robot_owner"}',now(),now()),
('92222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','robot-other@doso.test',crypt('StrongPass123',gen_salt('bf')),
 '{"provider":"email","providers":["email"]}','{"username":"robot_other"}',now(),now()),
('93333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','robot-provision@doso.test',crypt('StrongPass123',gen_salt('bf')),
 '{"provider":"email","providers":["email"]}','{"username":"robot_provision"}',now(),now()),
('94444444-4444-4444-8444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','robot-quarantine@doso.test',crypt('StrongPass123',gen_salt('bf')),
 '{"provider":"email","providers":["email"]}','{"username":"robot_quarantine"}',now(),now());

insert into auth.sessions(id,user_id,created_at,updated_at) values
('91111111-1111-4111-8111-111111111192','91111111-1111-4111-8111-111111111111',now(),now());

insert into public.account_terminals(id,user_id,auth_session_id,installation_id,platform,device_label)
values
('91111111-1111-4111-8111-111111111191','91111111-1111-4111-8111-111111111111','91111111-1111-4111-8111-111111111192','robot-owner-install','android','Robot owner phone'),
('92222222-2222-4222-8222-222222222291','92222222-2222-4222-8222-222222222222','92222222-2222-4222-8222-222222222292','robot-other-install','android','Other phone');

insert into public.devices(id,owner_id,model_code,display_name,category,environment,serial_number,is_demo,
  robot_authority_version,robot_lifecycle,robot_public_key_pem,robot_public_key_fingerprint,robot_authorization_epoch,robot_active_boot_id)
values
('91111111-1111-4111-8111-111111111101','91111111-1111-4111-8111-111111111111','thunder','Trusted robot','四足','室内','ROBOT-G014-001',false,
 5,'owned',repeat('K',64),repeat('a',64),3,'boot-g014-001'),
('92222222-2222-4222-8222-222222222201','92222222-2222-4222-8222-222222222222','thunder','Other robot','四足','室内','ROBOT-G014-002',false,
 2,'owned',repeat('L',64),repeat('b',64),2,'boot-other-001');

insert into public.devices(id,owner_id,model_code,display_name,category,environment,serial_number,is_demo)
values('91111111-1111-4111-8111-111111111102','93333333-3333-4333-8333-333333333333','thunder','Provision target','四足','室内','ROBOT-G014-003',false);
insert into public.devices(id,owner_id,model_code,display_name,category,environment,serial_number,is_demo,robot_lifecycle)
values('91111111-1111-4111-8111-111111111105','94444444-4444-4444-8444-444444444444','thunder','Quarantined target','四足','室内','ROBOT-G014-004',false,'quarantined');
create temporary table g014_provision_before as
select robot_authority_version,robot_authorization_epoch,robot_lifecycle,robot_public_key_pem,
  robot_public_key_fingerprint,robot_active_boot_id
from public.devices where id='91111111-1111-4111-8111-111111111102';
set local role service_role;
select throws_ok($$select public.provision_robot_device_authority('91111111-1111-4111-8111-111111111102',null,
  '06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9','boot-provisioned-001','factory_line')$$,
  'P0001','invalid robot authority provisioning input','provisioning rejects a NULL public key PEM');
select throws_ok($$select public.provision_robot_device_authority('91111111-1111-4111-8111-111111111102',$pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=
-----END PUBLIC KEY-----$pem$,null,'boot-provisioned-001','factory_line')$$,
  'P0001','invalid robot authority provisioning input','provisioning rejects a NULL public key fingerprint');
select throws_ok($$select public.provision_robot_device_authority('91111111-1111-4111-8111-111111111102',$pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=
-----END PUBLIC KEY-----$pem$,'06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9',null,'factory_line')$$,
  'P0001','invalid robot authority provisioning input','provisioning rejects a NULL boot identifier');
select throws_ok($$select public.provision_robot_device_authority('91111111-1111-4111-8111-111111111102','not-a-pem',repeat('0',64),'boot-provisioned-001','factory_line')$$,
  'P0001','invalid robot authority provisioning input','provisioning rejects a malformed public key PEM');
select throws_ok($$select public.provision_robot_device_authority('91111111-1111-4111-8111-111111111102',$pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=
-----END PUBLIC KEY-----$pem$,repeat('0',64),'boot-provisioned-001','factory_line')$$,
  'P0001','robot public key fingerprint mismatch','provisioning rejects a fingerprint that is not SHA-256 of SPKI DER');
select throws_ok($$select public.provision_robot_device_authority('91111111-1111-4111-8111-111111111102',$pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=
-----END PUBLIC KEY-----$pem$,'06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9','bad boot!','factory_line')$$,
  'P0001','invalid robot authority provisioning input','provisioning rejects a boot identifier outside the protocol grammar');
select throws_ok($$select public.provision_robot_device_authority('91111111-1111-4111-8111-111111111105',$pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=
-----END PUBLIC KEY-----$pem$,'06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9','boot-quarantine-001','factory_line')$$,
  'P0001','provisionable owned device is required','ordinary provisioning cannot recover a quarantined device');
reset role;
select ok((select d.robot_authority_version=b.robot_authority_version
  and d.robot_authorization_epoch=b.robot_authorization_epoch
  and d.robot_lifecycle=b.robot_lifecycle
  and d.robot_public_key_pem is not distinct from b.robot_public_key_pem
  and d.robot_public_key_fingerprint is not distinct from b.robot_public_key_fingerprint
  and d.robot_active_boot_id is not distinct from b.robot_active_boot_id
  from public.devices d cross join g014_provision_before b
  where d.id='91111111-1111-4111-8111-111111111102'),
  'rejected NULL provisioning inputs leave all authority state unchanged');
select is((select count(*) from public.audit_logs where action='robot.authority_provisioned'
  and resource_id='91111111-1111-4111-8111-111111111102'),0::bigint,
  'rejected NULL provisioning inputs create no authority audit');
set local role service_role;
select lives_ok($$select public.provision_robot_device_authority('91111111-1111-4111-8111-111111111102',$pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=
-----END PUBLIC KEY-----$pem$,'06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9','boot-provisioned-001','factory_line')$$,
  'service role can initialize a real device authority through the production RPC');
reset role;
select ok((select robot_lifecycle='owned' and robot_authority_version=2 and robot_authorization_epoch=2
  and robot_public_key_fingerprint='06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9' and robot_active_boot_id='boot-provisioned-001'
  from public.devices where id='91111111-1111-4111-8111-111111111102'),
  'authority provisioning advances version and epoch exactly once');
select ok((select metadata->>'publicKeyFingerprint'='06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9'
  and metadata->>'reason'='factory_line' and metadata ? 'authorityVersion' and metadata ? 'authorizationEpoch'
  and metadata::text not like '%BEGIN PUBLIC KEY%' and metadata::text not like '%signature%'
  from public.audit_logs where action='robot.authority_provisioned' and resource_id='91111111-1111-4111-8111-111111111102'),
  'authority audit stores fingerprint, reason and fences without PEM or signature material');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"91111111-1111-4111-8111-111111111192"}',true);

select throws_ok($$insert into public.devices(id,owner_id,model_code,display_name,category,environment,is_demo,
  robot_authority_version,robot_lifecycle,robot_public_key_pem,robot_public_key_fingerprint,robot_authorization_epoch,
  robot_active_boot_id,robot_last_telemetry_sequence,robot_last_telemetry_frame_digest,trusted_sensor_status,
  trusted_network_status,trusted_telemetry_captured_at,trusted_telemetry_received_at,battery_percent,connection_status)
 values('91111111-1111-4111-8111-111111111103','91111111-1111-4111-8111-111111111111','thunder','Forged demo','四足','室内',true,
  9,'owned',repeat('F',64),repeat('f',64),9,'forged-boot',99,repeat('f',64),'ok','online',now(),now(),100,'online')$$,
  '42501','new row violates row-level security policy for table "devices"','authenticated demo insert cannot forge robot authority or trusted telemetry');
select lives_ok($$insert into public.devices(id,owner_id,model_code,display_name,category,environment,is_demo)
 values('91111111-1111-4111-8111-111111111104','91111111-1111-4111-8111-111111111111','thunder','Safe demo','四足','室内',true)$$,
  'authenticated safe demo insert remains available');
select ok((select robot_authority_version=1 and robot_authorization_epoch=1 and robot_lifecycle='unassigned'
  and robot_public_key_pem is null and robot_public_key_fingerprint is null and robot_active_boot_id is null
  and robot_last_telemetry_sequence=0 and robot_last_telemetry_frame_digest is null
  and trusted_sensor_status is null and trusted_network_status is null and trusted_telemetry_captured_at is null
  and trusted_telemetry_received_at is null and battery_percent is null and connection_status='offline'
  from public.devices where id='91111111-1111-4111-8111-111111111104'),
  'safe demo receives only untrusted default robot state');

create temporary table g014_first as
select public.create_robot_health_check('91111111-1111-4111-8111-111111111101','health-001',array['network','battery','battery'],30) result;
select is((select (result->>'created')::boolean from g014_first),true,'owner creates a real persisted health check');
select is((select count(*) from public.device_commands where id=(select (result->>'command_id')::uuid from g014_first)),1::bigint,'command projection is durable');
reset role;
select is((select count(*) from private.device_command_outbox where command_id=(select (result->>'command_id')::uuid from g014_first)),1::bigint,'command and outbox are atomic');
select is((select count(*) from public.audit_logs where action='robot.command_created' and resource_id=(select result->>'command_id' from g014_first)),1::bigint,'command audit is atomic');
select ok((select kind='diagnostics.health_check' and capability='command:diagnostics.health_check'
  and command_class='non_motion_diagnostic' and not may_actuate and safety_contract_id='stationary-health-check'
  and safety_contract_version=1 and include_fields=array['battery','network']::text[]
  from public.device_commands where id=(select (result->>'command_id')::uuid from g014_first)),
  'database freezes the exact non-motion safety contract');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"91111111-1111-4111-8111-111111111192"}',true);
select is((public.create_robot_health_check('91111111-1111-4111-8111-111111111101','health-001',array['battery','network'],30)->>'created')::boolean,false,'same request is idempotent');
select is((select count(*) from public.device_commands where device_id='91111111-1111-4111-8111-111111111101' and idempotency_key='health-001'),1::bigint,'idempotency creates one command');
select throws_ok($$select public.create_robot_health_check('91111111-1111-4111-8111-111111111101','health-001',array['sensors'],30)$$,
  'P0001','idempotency key conflicts with another request','same key cannot alias a different request');
select throws_ok($$select public.create_robot_health_check('91111111-1111-4111-8111-111111111101','health-001',array['battery','network'],31)$$,
  'P0001','idempotency key conflicts with another request','same key with a different TTL is a semantic conflict');
select throws_ok($$select public.create_robot_health_check('92222222-2222-4222-8222-222222222201','cross-owner',array['battery'],30)$$,
  'P0001','trusted owned robot is required','cross-owner command creation is rejected');
select is((select count(*) from public.device_commands),1::bigint,'RLS exposes only the owner command');
select throws_ok($$insert into public.device_commands(device_id,owner_id,terminal_id,actor_user_id,auth_session_id,authorization_epoch,
 expected_boot_id,expected_device_version,expected_public_key_fingerprint,idempotency_key,request_digest,include_fields,expires_at)
 values('91111111-1111-4111-8111-111111111101','91111111-1111-4111-8111-111111111111','91111111-1111-4111-8111-111111111191',
 '91111111-1111-4111-8111-111111111111','91111111-1111-4111-8111-111111111192',3,'boot-g014-001',5,
 repeat('a',64),'forged',repeat('f',64),array['battery'],now()+interval '30 seconds')$$,
 '42501','permission denied for table device_commands','client cannot forge commands');
select throws_ok($$update public.devices set robot_last_telemetry_sequence=99 where id='91111111-1111-4111-8111-111111111101'$$,
 '42501','permission denied for table devices','client cannot forge trusted telemetry');
reset role;

create function pg_temp.fail_g014_outbox() returns trigger language plpgsql as $$begin
  if exists(select 1 from public.device_commands where id=new.command_id and idempotency_key='fault-outbox') then
    raise exception 'injected_g014_outbox_failure';
  end if;
  return new;
end$$;
create trigger inject_g014_outbox before insert on private.device_command_outbox for each row execute function pg_temp.fail_g014_outbox();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"91111111-1111-4111-8111-111111111192"}',true);
select throws_ok($$select public.create_robot_health_check('91111111-1111-4111-8111-111111111101','fault-outbox',array['battery'],30)$$,
 'P0001','injected_g014_outbox_failure','outbox failure aborts command transaction');
reset role;
select is((select count(*) from public.device_commands where idempotency_key='fault-outbox'),0::bigint,'outbox failure rolls back command');
select is((select count(*) from public.audit_logs where action='robot.command_created' and metadata->>'deviceId'='91111111-1111-4111-8111-111111111101' and resource_id not in (select id::text from public.device_commands)),0::bigint,'outbox failure leaves no orphan audit');

create temporary table g014_lease as select public.claim_robot_command_for_publish('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',30) result;
select is((select (result->>'claimed')::boolean from g014_lease),true,'worker claims queued command');
select is((select delivery_status from public.device_commands where id=(select (result->>'command_id')::uuid from g014_lease)),'leased'::text,'claim updates command projection');
select is((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g014_lease),gen_random_uuid(),(select (result->>'fencing_token')::bigint from g014_lease))
  ->>'reason'),'stale_lease'::text,'stale worker fencing is rejected before transport begins');
select is((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g014_lease),(select (result->>'lease_token')::uuid from g014_lease),
  (select (result->>'fencing_token')::bigint from g014_lease))->>'delivery_status'),'dispatching'::text,
  'authoritative lease passes the fenced transport-begin boundary');
select is((public.finish_robot_command_publish(
  (select (result->>'command_id')::uuid from g014_lease),(select (result->>'lease_token')::uuid from g014_lease),(select (result->>'fencing_token')::bigint from g014_lease),
  'published','transport-g014-1',null)->>'delivery_status'),'published'::text,'authoritative lease records transport publication');
select ok((select delivery_status='published' and ack_status is null from public.device_commands
  where id=(select (result->>'command_id')::uuid from g014_lease)),'publish receipt is never device success');

create temporary table g014_context as
select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',(select (result->>'command_id')::uuid from g014_lease)) result;
create temporary table g014_ack as
select jsonb_build_object('protocol_version',1,'command_id',(select result->>'command_id' from g014_lease),
 'device_id','91111111-1111-4111-8111-111111111101','authorization_epoch',3,'idempotency_key','health-001','boot_id','boot-g014-001',
 'status','accepted','occurred_at_ms',floor(extract(epoch from now())*1000)::bigint,'reason',null) value;
select ok((select result->>'reason'='clock_unavailable' and (result->>'retryable')::boolean and not (result->>'applied')::boolean
  from (select public.ingest_verified_robot_ack((select result->'device' from g014_context),(select result->'command' from g014_context),
    (select value from g014_ack),'abcdefghijklmnop',repeat('1',64),'clock_unavailable') result) attempt),
  'retryable clock failure is append-only audited without projecting');
select ok((select result->>'reason'='clock_unavailable' and (result->>'retryable')::boolean
  from (select public.ingest_verified_robot_ack((select result->'device' from g014_context),(select result->'command' from g014_context),
    (select value from g014_ack),'abcdefghijklmnop',repeat('1',64),'clock_unavailable') result) attempt),
  'repeated transient attempt is idempotent but remains retryable');
create temporary table g014_ack_result as
select public.ingest_verified_robot_ack((select result->'device' from g014_context),(select result->'command' from g014_context),
  (select value from g014_ack),'abcdefghijklmnop',repeat('1',64)) result;
select is((select (result->>'applied')::boolean from g014_ack_result),true,'same digest applies after the retryable clock failure clears');
select is((select count(*) from private.device_command_ack_events where frame_digest=repeat('1',64)),2::bigint,'retryable attempt and final ACK are both append-only persisted');
select is((select count(*) from private.device_command_ack_events where frame_digest=repeat('1',64)
  and projection_reason not in ('clock_unavailable','projection_conflict')),1::bigint,'a digest has exactly one final ACK decision');
select throws_ok($$update private.device_command_ack_events set projection_reason='forged' where frame_digest=repeat('1',64)$$,
 '42501','robot ACK events are append-only','ACK event rows cannot be rewritten');
select is((select ack_status from public.device_commands where id=(select (result->>'command_id')::uuid from g014_lease)),'accepted'::text,'ACK event and projection commit atomically');
select is((public.ingest_verified_robot_ack((select result->'device' from g014_context),(select result->'command' from g014_context),
  (select value from g014_ack),'abcdefghijklmnop',repeat('1',64))->>'reason'),'duplicate'::text,'duplicate frame digest is idempotent');
select is((select count(*) from private.device_command_ack_events where frame_digest=repeat('1',64)),2::bigint,'duplicate does not append beyond transient plus final decisions');
select is((public.ingest_verified_robot_ack((select result->'device' from g014_context),(select result->'command' from g014_context),
  (select value from g014_ack),'abcdefghijklmnop',repeat('01',32),'command_expired')->>'reason'),'command_expired'::text,
  'Edge precheck rejection is persisted as a stable non-projection reason');
select ok((select not applied and projection_reason='command_expired' from private.device_command_ack_events where frame_digest=repeat('01',32)),
  'precheck rejection can never force an ACK projection');
select is((public.ingest_verified_robot_ack((select result->'device' from g014_context),(select result->'command' from g014_context),
  (select value from g014_ack),'abcdefghijklmnop',repeat('03',32),'device_binding_mismatch')->>'reason'),'device_binding_mismatch'::text,
  'verified tampered binding ACK is stored with the Edge precheck reason instead of raising');
select ok((select not applied and projection_reason='device_binding_mismatch' from private.device_command_ack_events where frame_digest=repeat('03',32)),
  'tampered binding precheck is auditable and cannot mutate projection');

create temporary table g014_fresh_context as
select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',(select (result->>'command_id')::uuid from g014_lease)) result;
select is((public.ingest_verified_robot_ack((select result->'device' from g014_fresh_context),(select result->'command' from g014_fresh_context),
  jsonb_set((select value from g014_ack),'{status}','"accepted"'), 'abcdefghijklmnop',repeat('2',64))->>'reason'),'illegal_ack_transition'::text,
  'duplicate ACK status appends but cannot regress projection');
select is((select count(*) from private.device_command_ack_events where frame_digest=repeat('2',64) and not applied),1::bigint,'illegal trusted ACK remains auditable');
select is((public.ingest_verified_robot_ack((select result->'device' from g014_fresh_context),null,
  jsonb_set((select value from g014_ack),'{command_id}',to_jsonb('99999999-9999-4999-8999-999999999999'::text)),
  'abcdefghijklmnop',repeat('3',64))->>'reason'),'unknown_command'::text,'verified unknown command ACK is appended as unapplied');

create temporary table g014_expired_context as select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',(select (result->>'command_id')::uuid from g014_lease)) result;
select is((public.ingest_verified_robot_ack((select result->'device' from g014_expired_context),(select result->'command' from g014_expired_context),
  jsonb_set(jsonb_set((select value from g014_ack),'{status}','"executing"'),'{occurred_at_ms}',to_jsonb(floor(extract(epoch from now()-interval '61 seconds')*1000)::bigint)),
  'abcdefghijklmnop',repeat('b',64))->>'reason'),'frame_expired'::text,'late ACK is appended but cannot project');

create temporary table g014_exec_context as select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',(select (result->>'command_id')::uuid from g014_lease)) result;
select ok((select result->>'reason'='projection_conflict' and (result->>'retryable')::boolean and not (result->>'applied')::boolean
  from (select public.ingest_verified_robot_ack((select result->'device' from g014_exec_context),
    jsonb_set((select result->'command' from g014_exec_context),'{version}','999'),
    jsonb_set((select value from g014_ack),'{status}','"executing"'),'abcdefghijklmnop',repeat('4',64)) result) attempt),
  'retryable projection conflict is append-only audited without projecting');
select is((public.ingest_verified_robot_ack((select result->'device' from g014_exec_context),(select result->'command' from g014_exec_context),
  jsonb_set((select value from g014_ack),'{status}','"executing"'),'abcdefghijklmnop',repeat('4',64))->>'reason'),'applied'::text,
  'same digest advances to executing after context refresh');
select ok((select count(*)=2 and count(*) filter (where projection_reason='projection_conflict')=1
  and count(*) filter (where applied)=1 from private.device_command_ack_events where frame_digest=repeat('4',64)),
  'projection conflict attempt and final applied decision are both preserved');
create temporary table g014_terminal_context as select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',(select (result->>'command_id')::uuid from g014_lease)) result;
select is((public.ingest_verified_robot_ack((select result->'device' from g014_terminal_context),(select result->'command' from g014_terminal_context),
  jsonb_set((select value from g014_ack),'{status}','"succeeded"'),'abcdefghijklmnop',repeat('5',64))->>'reason'),'applied'::text,'executing advances to succeeded');
select ok((select delivery_status='completed' and ack_status='succeeded' from public.device_commands
  where id=(select (result->>'command_id')::uuid from g014_lease)),'terminal ACK completes projection and outbox');
create temporary table g014_late_context as select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',(select (result->>'command_id')::uuid from g014_lease)) result;
select is((public.ingest_verified_robot_ack((select result->'device' from g014_late_context),(select result->'command' from g014_late_context),
  jsonb_set(jsonb_set((select value from g014_ack),'{status}','"failed"'),'{reason}','{"code":"late","message":"late"}'::jsonb),
  'abcdefghijklmnop',repeat('6',64))->>'reason'),'illegal_ack_transition'::text,'terminal command cannot be rewritten by late ACK');

create temporary table g014_telemetry_context as select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',null) result;
create temporary table g014_frame as select jsonb_build_object('protocol_version',1,'device_id','91111111-1111-4111-8111-111111111101',
 'authorization_epoch',3,'boot_id','boot-g014-001','sequence',1,'captured_at_ms',floor(extract(epoch from now())*1000)::bigint,
 'kind','diagnostics.health','payload',jsonb_build_object('battery_percent',77,'sensor_status','ok','network_status','online'),
 'signature_b64url','abcdefghijklmnop') value;
select is((public.ingest_verified_robot_telemetry((select result->'device' from g014_telemetry_context),(select value from g014_frame),repeat('7',64))->>'reason'),'applied'::text,'verified telemetry applies');
select ok((select robot_last_telemetry_sequence=1 and battery_percent=77 and trusted_sensor_status='ok'
  and trusted_network_status='online' and connection_status='online' from public.devices
  where id='91111111-1111-4111-8111-111111111101'),'telemetry atomically updates trusted snapshot');
select is((public.ingest_verified_robot_telemetry((select result->'device' from g014_telemetry_context),(select value from g014_frame),repeat('8',64))->>'reason'),'sequence_replay'::text,'sequence replay cannot mutate snapshot');
select is((public.ingest_verified_robot_telemetry((select result->'device' from g014_telemetry_context),
  jsonb_set((select value from g014_frame),'{boot_id}','"boot-old"'),repeat('9',64))->>'reason'),'projection_conflict'::text,'old boot telemetry is rejected');
select is((public.ingest_verified_robot_telemetry((select result->'device' from g014_telemetry_context),
  jsonb_set((select value from g014_frame),'{authorization_epoch}','2'),repeat('c',64))->>'reason'),'projection_conflict'::text,'old epoch telemetry is rejected');
select is((public.ingest_verified_robot_telemetry((select result->'device' from g014_telemetry_context),
  jsonb_set((select value from g014_frame),'{captured_at_ms}',to_jsonb(floor(extract(epoch from now()-interval '61 seconds')*1000)::bigint)),repeat('a',64))->>'reason'),'frame_expired'::text,
  'stale telemetry is rejected by database time window');

select throws_ok($$update public.devices set robot_public_key_pem=repeat('Z',64) where id='91111111-1111-4111-8111-111111111101'$$,
 'P0001','robot authority version must increment exactly once','same-version key replacement is rejected');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"91111111-1111-4111-8111-111111111192"}',true);
create temporary table g014_failure_command as select public.create_robot_health_check('91111111-1111-4111-8111-111111111101','health-failure',array['battery'],30) result;
reset role;
create temporary table g014_failure_lease1 as select public.claim_robot_command_for_publish('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',30) result;
select is((public.begin_robot_command_publish((select (result->>'command_id')::uuid from g014_failure_lease1),
  (select (result->>'lease_token')::uuid from g014_failure_lease1),(select (result->>'fencing_token')::bigint from g014_failure_lease1))
  ->>'delivery_status'),'dispatching'::text,'first transport-failure fixture begins dispatch');
select is((public.finish_robot_command_publish((select (result->>'command_id')::uuid from g014_failure_lease1),
  (select (result->>'lease_token')::uuid from g014_failure_lease1),(select (result->>'fencing_token')::bigint from g014_failure_lease1),
  'transport_failure',null,'socket_closed')->>'delivery_status'),'queued'::text,'pre-publish transport failure backs off without device failure');
select ok((select ack_status is null and delivery_status='queued' from public.device_commands where id=(select (result->>'command_id')::uuid from g014_failure_command)),
  'transport retry never invents an ACK');
update private.device_command_outbox set available_at=now() where command_id=(select (result->>'command_id')::uuid from g014_failure_command);
create temporary table g014_failure_lease2 as select public.claim_robot_command_for_publish('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',30) result;
update private.device_command_outbox set attempts=max_attempts where command_id=(select (result->>'command_id')::uuid from g014_failure_command);
select is((public.begin_robot_command_publish((select (result->>'command_id')::uuid from g014_failure_lease2),
  (select (result->>'lease_token')::uuid from g014_failure_lease2),(select (result->>'fencing_token')::bigint from g014_failure_lease2))
  ->>'delivery_status'),'dispatching'::text,'final transport-failure fixture begins dispatch');
select is((public.finish_robot_command_publish((select (result->>'command_id')::uuid from g014_failure_lease2),
  (select (result->>'lease_token')::uuid from g014_failure_lease2),(select (result->>'fencing_token')::bigint from g014_failure_lease2),
  'transport_failure',null,'socket_closed')->>'delivery_status'),'dead_letter'::text,'retry exhaustion reaches transport dead letter');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"91111111-1111-4111-8111-111111111192"}',true);
create temporary table g014_unknown_command as select public.create_robot_health_check('91111111-1111-4111-8111-111111111101','health-unknown',array['network'],30) result;
reset role;
create temporary table g014_unknown_lease as select public.claim_robot_command_for_publish('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',30) result;
select is((public.begin_robot_command_publish((select (result->>'command_id')::uuid from g014_unknown_lease),
  (select (result->>'lease_token')::uuid from g014_unknown_lease),(select (result->>'fencing_token')::bigint from g014_unknown_lease))
  ->>'delivery_status'),'dispatching'::text,'ambiguous transport fixture begins dispatch');
select is((public.finish_robot_command_publish((select (result->>'command_id')::uuid from g014_unknown_lease),
  (select (result->>'lease_token')::uuid from g014_unknown_lease),(select (result->>'fencing_token')::bigint from g014_unknown_lease),
  'delivery_unknown',null,'publish_timeout')->>'delivery_status'),'delivery_unknown'::text,'ambiguous publish becomes delivery_unknown without retry');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"91111111-1111-4111-8111-111111111192"}',true);
create temporary table g014_timeout_command as select public.create_robot_health_check('91111111-1111-4111-8111-111111111101','health-timeout',array['sensors'],30) result;
reset role;
create temporary table g014_timeout_lease as select public.claim_robot_command_for_publish('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',30) result;
select is((public.begin_robot_command_publish((select (result->>'command_id')::uuid from g014_timeout_lease),
  (select (result->>'lease_token')::uuid from g014_timeout_lease),(select (result->>'fencing_token')::bigint from g014_timeout_lease))
  ->>'delivery_status'),'dispatching'::text,'ACK timeout fixture begins dispatch');
select lives_ok($$select public.finish_robot_command_publish((select (result->>'command_id')::uuid from g014_timeout_lease),
  (select (result->>'lease_token')::uuid from g014_timeout_lease),(select (result->>'fencing_token')::bigint from g014_timeout_lease),
  'published','transport-timeout',null)$$,'timeout fixture publishes without implying success');
update private.device_command_outbox set ack_deadline=now()-interval '1 second' where command_id=(select (result->>'command_id')::uuid from g014_timeout_command);
select is(public.reconcile_robot_command_timeouts(10),1,'published ACK timeout is reconciled');
select is((select delivery_status from public.device_commands where id=(select (result->>'command_id')::uuid from g014_timeout_command)),
 'delivery_unknown'::text,'ACK timeout never invents device failure or automatic retry');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"91111111-1111-4111-8111-111111111192"}',true);
create temporary table g014_fault_command as select public.create_robot_health_check('91111111-1111-4111-8111-111111111101','health-ack-fault',array['battery'],30) result;
reset role;
create temporary table g014_fault_lease as select public.claim_robot_command_for_publish('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',30) result;
select is((public.begin_robot_command_publish((select (result->>'command_id')::uuid from g014_fault_lease),
  (select (result->>'lease_token')::uuid from g014_fault_lease),(select (result->>'fencing_token')::bigint from g014_fault_lease))
  ->>'delivery_status'),'dispatching'::text,'ACK atomicity fixture begins dispatch');
select lives_ok($$select public.finish_robot_command_publish((select (result->>'command_id')::uuid from g014_fault_lease),
  (select (result->>'lease_token')::uuid from g014_fault_lease),(select (result->>'fencing_token')::bigint from g014_fault_lease),
  'published','transport-fault',null)$$,'ACK atomicity fixture publishes without implying success');
create temporary table g014_fault_context as select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',(select (result->>'command_id')::uuid from g014_fault_command)) result;
create function pg_temp.fail_g014_command_projection() returns trigger language plpgsql as $$
begin
  if old.id=(select (result->>'command_id')::uuid from g014_fault_command)
     and exists(select 1 from private.device_command_ack_events where frame_digest=repeat('d',64)) then
    raise exception 'injected_g014_projection_failure';
  end if;
  return new;
end$$;
create trigger inject_g014_projection before update on public.device_commands for each row execute function pg_temp.fail_g014_command_projection();
select throws_ok($$select public.ingest_verified_robot_ack((select result->'device' from g014_fault_context),(select result->'command' from g014_fault_context),
 jsonb_build_object('protocol_version',1,'command_id',(select result->>'command_id' from g014_fault_command),
 'device_id','91111111-1111-4111-8111-111111111101','authorization_epoch',3,'idempotency_key','health-ack-fault','boot_id','boot-g014-001',
 'status','accepted','occurred_at_ms',floor(extract(epoch from now())*1000)::bigint,'reason',null),
 'abcdefghijklmnop',repeat('d',64))$$,'P0001','injected_g014_projection_failure','projection failure aborts ACK event transaction');
select is((select count(*) from private.device_command_ack_events where frame_digest=repeat('d',64)),0::bigint,'projection failure rolls back appended ACK event');
select is((select ack_status from public.device_commands where id=(select (result->>'command_id')::uuid from g014_fault_command)),null::text,'projection failure leaves command unchanged');

create temporary table g014_race_context as select public.get_robot_ingress_context('91111111-1111-4111-8111-111111111101',(select (result->>'command_id')::uuid from g014_fault_command)) result;
update public.devices set robot_authority_version=robot_authority_version+1,robot_authorization_epoch=robot_authorization_epoch+1,
 robot_active_boot_id='boot-g014-002' where id='91111111-1111-4111-8111-111111111101';
select is((public.ingest_verified_robot_ack((select result->'device' from g014_race_context),(select result->'command' from g014_race_context),
 jsonb_build_object('protocol_version',1,'command_id',(select result->>'command_id' from g014_fault_command),
 'device_id','91111111-1111-4111-8111-111111111101','authorization_epoch',3,'idempotency_key','health-ack-fault','boot_id','boot-g014-001',
 'status','accepted','occurred_at_ms',floor(extract(epoch from now())*1000)::bigint,'reason',null),
 'abcdefghijklmnop',repeat('e',64))->>'reason'),'projection_conflict'::text,'authority race is detected after verification');
select is((select delivery_status from public.device_commands where id=(select (result->>'command_id')::uuid from g014_fault_command)),
 'revocation_pending'::text,'published command becomes revocation_pending on authority change');

create temporary table g014_authority_before as select robot_authority_version,robot_authorization_epoch from public.devices where id='91111111-1111-4111-8111-111111111101';
set local role service_role;
select lives_ok($$update public.account_terminals set revoked_at=now(),revocation_reason='g014_test' where id='91111111-1111-4111-8111-111111111191'$$,
  'service-role terminal revocation succeeds through the hardened trigger');
reset role;
select ok((select robot_authority_version>(select robot_authority_version from g014_authority_before)
  and robot_authorization_epoch>(select robot_authorization_epoch from g014_authority_before)
  and robot_active_boot_id is null from public.devices where id='91111111-1111-4111-8111-111111111101'),
  'terminal revocation monotonically invalidates device authority');

create temporary table g014_other_before as select robot_authority_version from public.devices where id='92222222-2222-4222-8222-222222222201';
set local role service_role;
select lives_ok($$update public.profiles set account_status='suspended' where id='92222222-2222-4222-8222-222222222222'$$,
  'service-role account suspension succeeds through the hardened trigger');
reset role;
select is((select account_status from public.profiles where id='92222222-2222-4222-8222-222222222222'),'suspended'::text,
  'service-role account status update is committed');
select ok((select robot_authority_version>(select robot_authority_version from g014_other_before) and robot_active_boot_id is null
  from public.devices where id='92222222-2222-4222-8222-222222222201'),'account suspension invalidates robot authority');

create temporary table g014_unbind_before as select robot_authority_version,robot_authorization_epoch from public.devices where id='91111111-1111-4111-8111-111111111101';
select is((public.unbind_device('91111111-1111-4111-8111-111111111101','91111111-1111-4111-8111-111111111111',false)).owner_id,null::uuid,
  'existing unbind RPC removes robot owner');
select ok((select owner_id is null and robot_lifecycle='unassigned'
  and robot_authority_version>(select robot_authority_version from g014_unbind_before)
  and robot_authorization_epoch>(select robot_authorization_epoch from g014_unbind_before)
  from public.devices where id='91111111-1111-4111-8111-111111111101'),'unbind monotonically invalidates authority and lifecycle');

select * from finish();
rollback;
