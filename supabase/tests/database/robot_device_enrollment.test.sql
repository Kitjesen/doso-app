begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

select has_table('private','robot_manufacturing_identities','manufacturing identities are private');
select has_table('private','robot_enrollment_sessions','enrollment sessions are private');
select ok(
  has_function_privilege('service_role','public.register_robot_manufacturing_identity(uuid,text,text,bigint)','EXECUTE')
  and has_function_privilege('service_role','public.begin_robot_device_enrollment(uuid,uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.get_robot_device_enrollment_context(uuid,uuid,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.advance_robot_factory_reset_counter(uuid,uuid,uuid,bigint,bigint,bigint,text,bigint)','EXECUTE')
  and has_function_privilege('service_role','public.confirm_robot_device_identity(uuid,uuid,uuid,bigint,bigint,text,bigint)','EXECUTE')
  and has_function_privilege('service_role','public.complete_robot_device_enrollment(uuid,uuid,uuid,bigint,bigint,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('authenticated','public.begin_robot_device_enrollment(uuid,uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.get_robot_device_enrollment_context(uuid,uuid,uuid)','EXECUTE'),
  'only the service role can cross the robot enrollment RPC boundary'
);
select ok(
  not has_table_privilege('service_role','private.robot_manufacturing_identities','SELECT')
  and not has_table_privilege('service_role','private.robot_enrollment_sessions','SELECT')
  and not has_table_privilege('authenticated','private.robot_enrollment_sessions','SELECT'),
  'manufacturing identities and enrollment sessions have no direct API table path'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  'e1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','enrollment-owner@doso.test',
  crypt('StrongPass123',gen_salt('bf')),
  '{"provider":"email","providers":["email"]}',
  '{"username":"enrollment_owner"}',now(),now()
);

insert into public.account_terminals(
  id,user_id,auth_session_id,installation_id,platform,device_label
) values (
  'e1000000-0000-4000-8000-000000000011',
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  'enrollment-owner-install','android','Enrollment owner phone'
);

insert into public.devices(
  id,owner_id,model_code,display_name,category,environment,serial_number,is_demo,
  robot_authority_version,robot_lifecycle,robot_authorization_epoch
) values (
  'e1000000-0000-4000-8000-000000000021',
  'e1000000-0000-4000-8000-000000000001',
  'thunder','Enrollment robot','四足','室内','ROBOT-ENROLL-001',false,
  4,'owned',7
);

set local role service_role;

select throws_ok($sql$
  select public.register_robot_manufacturing_identity(
    'e1000000-0000-4000-8000-000000000021',
    $pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=
-----END PUBLIC KEY-----$pem$,
    '06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9',
    9007199254740992
  )
$sql$,'P0001','invalid robot manufacturing identity input','factory-reset counter cannot exceed the JSON safe-integer range');

select lives_ok($sql$
  select public.register_robot_manufacturing_identity(
    'e1000000-0000-4000-8000-000000000021',
    $pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=
-----END PUBLIC KEY-----$pem$,
    '06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9',
    3
  )
$sql$,'manufacturing registers the immutable device identity');

create temporary table enrollment_begin_result as
select public.begin_robot_device_enrollment(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  'e1000000-0000-4000-8000-000000000021'
) as result;

select ok(
  (select result->>'phase'='challenge_issued'
     and result->>'device_id'='e1000000-0000-4000-8000-000000000021'
     and length(result->>'nonce_b64url')=43
   from enrollment_begin_result),
  'the active owner session receives one bounded enrollment challenge'
);

create temporary table enrollment_begin_again as
select public.begin_robot_device_enrollment(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  'e1000000-0000-4000-8000-000000000021'
) as result;

select ok(
  (select a.result->>'enrollment_id'=b.result->>'enrollment_id'
     and b.result->>'reused'='true'
   from enrollment_begin_result a cross join enrollment_begin_again b),
  'repeating begin from the same authority reuses the one active challenge'
);

create temporary table enrollment_context as
select public.get_robot_device_enrollment_context(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  (select (result->>'enrollment_id')::uuid from enrollment_begin_result)
) as result;

select ok(
  (select result->>'found'='true'
     and result->'session'->>'phase'='challenge_issued'
     and result->'manufacturing_identity'->>'public_key_fingerprint'=
       '06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9'
   from enrollment_context),
  'the Edge context receives the active challenge and manufacturing verification key'
);

select throws_ok($sql$
  select public.advance_robot_factory_reset_counter(
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000012',
    (select (result->>'enrollment_id')::uuid from enrollment_begin_result),
    1,9007199254740992,1,repeat('d',64),floor(extract(epoch from now())*1000)::bigint
  )
$sql$,'P0001','invalid robot factory reset proof commit','unsafe reset counter is rejected before enrollment mutation');

create temporary table enrollment_reset_advanced as
select public.advance_robot_factory_reset_counter(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  (select (result->>'enrollment_id')::uuid from enrollment_begin_result),
  1,4,1,repeat('d',64),floor(extract(epoch from now())*1000)::bigint
) as result;

select ok(
  (select result->>'phase'='invalidated'
     and result->>'reason'='factory_reset_counter_advanced'
     and result->>'retry_required'='true'
     and result->>'factory_reset_counter'='4'
     and result->>'authority_version'='5'
     and result->>'authorization_epoch'='8'
   from enrollment_reset_advanced),
  'signed higher factory-reset counter atomically fences the old enrollment and runtime authority'
);

reset role;
select ok(
  (select factory_reset_counter=4
     and last_reset_proof_digest=repeat('d',64)
     and reset_counter_updated_at is not null
   from private.robot_manufacturing_identities
   where device_id='e1000000-0000-4000-8000-000000000021'),
  'manufacturing identity keeps its key while the reset counter advances monotonically'
);
select ok(
  (select robot_authority_version=5
     and robot_authorization_epoch=8
     and robot_public_key_pem is null
     and robot_public_key_fingerprint is null
     and robot_active_boot_id is null
   from public.devices where id='e1000000-0000-4000-8000-000000000021'),
  'factory reset clears the stale operational identity before enrollment retry'
);

set local role service_role;
select throws_ok($sql$
  select public.advance_robot_factory_reset_counter(
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000012',
    (select (result->>'enrollment_id')::uuid from enrollment_begin_result),
    1,4,1,repeat('d',64),floor(extract(epoch from now())*1000)::bigint
  )
$sql$,'P0001','robot factory reset context changed','factory-reset proof replay cannot advance the counter twice');

create temporary table enrollment_retry_result as
select public.begin_robot_device_enrollment(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  'e1000000-0000-4000-8000-000000000021'
) as result;

select ok(
  (select retry.result->>'enrollment_id'<>initial.result->>'enrollment_id'
     and retry.result->>'factory_reset_counter'='4'
     and retry.result->>'authority_version'='5'
     and retry.result->>'authorization_epoch'='8'
     and retry.result->>'device_event_sequence'='0'
   from enrollment_retry_result retry cross join enrollment_begin_result initial),
  'post-reset retry receives a fresh challenge bound to the new reset and authority epochs'
);

drop table enrollment_context;
create temporary table enrollment_context as
select public.get_robot_device_enrollment_context(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  (select (result->>'enrollment_id')::uuid from enrollment_retry_result)
) as result;

create temporary table enrollment_attested as
select public.confirm_robot_device_identity(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  (select (result->>'enrollment_id')::uuid from enrollment_retry_result),
  1,1,
  repeat('b',64),
  floor(extract(epoch from now())*1000)::bigint
) as result;

select ok(
  (select result->>'phase'='identity_verified' and result->>'version'='2'
   from enrollment_attested),
  'one verified manufacturing proof advances the enrollment exactly once'
);

select throws_ok($sql$
  select public.confirm_robot_device_identity(
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000012',
    (select (result->>'enrollment_id')::uuid from enrollment_retry_result),
    1,1,repeat('b',64),floor(extract(epoch from now())*1000)::bigint
  )
$sql$,'P0001','robot enrollment context changed','the same identity proof cannot be replayed');

create temporary table enrollment_completed as
select public.complete_robot_device_enrollment(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  (select (result->>'enrollment_id')::uuid from enrollment_retry_result),
  2,2,
  repeat('c',64),
  $pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA7vqszzJlN8XMcZA/sfdthUZMfZKiNFzIHtGw9gmocGA=
-----END PUBLIC KEY-----$pem$,
  '27988337299b63152a2319aac42fa29485c07fe0b9d2fd4e574e972b4239530d',
  'boot-enrollment-001',
  floor(extract(epoch from now())*1000)::bigint
) as result;

select ok(
  (select result->>'phase'='completed'
     and result->>'version'='3'
     and result->>'authority_version'='6'
     and result->>'authorization_epoch'='9'
   from enrollment_completed),
  'signed online confirmation atomically completes enrollment and advances runtime authority'
);

select throws_ok($sql$
  select public.complete_robot_device_enrollment(
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000012',
    (select (result->>'enrollment_id')::uuid from enrollment_retry_result),
    2,2,repeat('c',64),
    $pem$-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA7vqszzJlN8XMcZA/sfdthUZMfZKiNFzIHtGw9gmocGA=
-----END PUBLIC KEY-----$pem$,
    '27988337299b63152a2319aac42fa29485c07fe0b9d2fd4e574e972b4239530d',
    'boot-enrollment-001',floor(extract(epoch from now())*1000)::bigint
  )
$sql$,'P0001','robot enrollment context changed','online confirmation cannot be replayed');

reset role;

select ok(
  (select robot_public_key_fingerprint='27988337299b63152a2319aac42fa29485c07fe0b9d2fd4e574e972b4239530d'
     and robot_active_boot_id='boot-enrollment-001'
     and robot_authority_version=6
     and robot_authorization_epoch=9
   from public.devices where id='e1000000-0000-4000-8000-000000000021'),
  'the operational identity is stored only in the existing device authority projection'
);
select ok(
  (select phase='completed'
     and identity_proof_digest=repeat('b',64)
     and completion_digest=repeat('c',64)
     and identity_verified_at is not null
     and completed_at is not null
     and device_event_sequence=2
   from private.robot_enrollment_sessions
   where id=(select (result->>'enrollment_id')::uuid from enrollment_retry_result)),
  'the enrollment session persists only one-way state and proof digests'
);
select is(
  (select count(*) from public.audit_logs
   where action in (
     'robot.manufacturing_identity_registered',
     'robot.enrollment_challenge_issued',
     'robot.factory_reset_counter_advanced',
     'robot.enrollment_identity_verified',
     'robot.enrollment_completed',
     'robot.authority_provisioned'
   )),
  7::bigint,
  'manufacturing registration, challenges, reset, proof, completion and authority changes are audited'
);

set local role service_role;
create temporary table enrollment_after_completion as
select public.begin_robot_device_enrollment(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  'e1000000-0000-4000-8000-000000000021'
) as result;
reset role;

update private.robot_enrollment_sessions
set issued_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute'
where id=(select (result->>'enrollment_id')::uuid from enrollment_after_completion);

set local role service_role;
select is(
  (public.get_robot_device_enrollment_context(
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000012',
    (select (result->>'enrollment_id')::uuid from enrollment_after_completion)
  )->>'found'),
  'false'::text,
  'expired challenge is rejected lazily at the RPC boundary'
);
reset role;
select is(
  (select phase from private.robot_enrollment_sessions
   where id=(select (result->>'enrollment_id')::uuid from enrollment_after_completion)),
  'expired'::text,
  'expired challenge becomes terminal and cannot be reused'
);

set local role service_role;
create temporary table enrollment_before_owner_change as
select public.begin_robot_device_enrollment(
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000012',
  'e1000000-0000-4000-8000-000000000021'
) as result;
reset role;
update public.devices set owner_id=null where id='e1000000-0000-4000-8000-000000000021';
set local role service_role;
select is(
  (public.get_robot_device_enrollment_context(
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000012',
    (select (result->>'enrollment_id')::uuid from enrollment_before_owner_change)
  )->>'found'),
  'false'::text,
  'ownership and authority changes invalidate an in-flight enrollment'
);
reset role;
select is(
  (select phase from private.robot_enrollment_sessions
   where id=(select (result->>'enrollment_id')::uuid from enrollment_before_owner_change)),
  'invalidated'::text,
  'authority-changed enrollment becomes terminal'
);

select * from finish();
rollback;
