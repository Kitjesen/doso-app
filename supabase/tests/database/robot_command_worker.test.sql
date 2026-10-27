begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

select has_function(
  'public','begin_robot_command_publish',array['uuid','uuid','bigint'],
  'publish begin CAS exists'
);
select ok(
  has_function_privilege('service_role','public.begin_robot_command_publish(uuid,uuid,bigint)','EXECUTE')
  and not has_function_privilege('anon','public.begin_robot_command_publish(uuid,uuid,bigint)','EXECUTE')
  and not has_function_privilege('authenticated','public.begin_robot_command_publish(uuid,uuid,bigint)','EXECUTE'),
  'publish begin is service-role-only'
);
select ok(
  not has_table_privilege('service_role','private.device_command_outbox','SELECT')
  and not has_table_privilege('service_role','private.device_command_outbox','INSERT')
  and not has_table_privilege('service_role','private.device_command_outbox','UPDATE')
  and not has_table_privilege('service_role','private.device_command_outbox','DELETE'),
  'service role has no direct private outbox CRUD'
);
select ok(
  lower(pg_get_functiondef('public.begin_robot_command_publish(uuid,uuid,bigint)'::regprocedure)) like '%security definer%'
  and lower(pg_get_functiondef('public.begin_robot_command_publish(uuid,uuid,bigint)'::regprocedure)) like '%set search_path to ''''%',
  'publish begin is security definer with an empty fixed search path'
);
select ok(
  pg_get_constraintdef((select oid from pg_constraint
    where conrelid='public.device_commands'::regclass and conname='device_commands_delivery_status_check')) like '%dispatching%'
  and pg_get_constraintdef((select oid from pg_constraint
    where conrelid='private.device_command_outbox'::regclass and conname='device_command_outbox_status_check')) like '%dispatching%',
  'command projection and outbox both admit dispatching'
);
select ok(
  lower(pg_get_functiondef('public.claim_robot_command_for_publish(uuid,integer)'::regprocedure)) like '%skip locked%'
  and lower(pg_get_functiondef('public.begin_robot_command_publish(uuid,uuid,bigint)'::regprocedure)) like '%for update%',
  'claim and begin serialize competing workers without blocking the claim queue'
);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('a1500000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g015-main@doso.test',crypt('StrongPass123',gen_salt('bf')),'{"provider":"email","providers":["email"]}','{"username":"g015_main"}',now(),now()),
('a1500000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g015-pre-revoke@doso.test',crypt('StrongPass123',gen_salt('bf')),'{"provider":"email","providers":["email"]}','{"username":"g015_pre"}',now(),now()),
('a1500000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g015-post-revoke@doso.test',crypt('StrongPass123',gen_salt('bf')),'{"provider":"email","providers":["email"]}','{"username":"g015_post"}',now(),now()),
('a1500000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g015-account@doso.test',crypt('StrongPass123',gen_salt('bf')),'{"provider":"email","providers":["email"]}','{"username":"g015_account"}',now(),now()),
('a1500000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g015-owner@doso.test',crypt('StrongPass123',gen_salt('bf')),'{"provider":"email","providers":["email"]}','{"username":"g015_owner"}',now(),now());

insert into auth.sessions(id,user_id,created_at,updated_at) values
('a1520000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001',now(),now()),
('a1520000-0000-4000-8000-000000000002','a1500000-0000-4000-8000-000000000002',now(),now()),
('a1520000-0000-4000-8000-000000000003','a1500000-0000-4000-8000-000000000003',now(),now()),
('a1520000-0000-4000-8000-000000000004','a1500000-0000-4000-8000-000000000004',now(),now()),
('a1520000-0000-4000-8000-000000000005','a1500000-0000-4000-8000-000000000005',now(),now());

insert into public.account_terminals(id,user_id,auth_session_id,installation_id,platform,device_label)
values
('a1510000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001','a1520000-0000-4000-8000-000000000001','g015-main','android','G015 main'),
('a1510000-0000-4000-8000-000000000002','a1500000-0000-4000-8000-000000000002','a1520000-0000-4000-8000-000000000002','g015-pre','android','G015 pre revoke'),
('a1510000-0000-4000-8000-000000000003','a1500000-0000-4000-8000-000000000003','a1520000-0000-4000-8000-000000000003','g015-post','android','G015 post revoke'),
('a1510000-0000-4000-8000-000000000004','a1500000-0000-4000-8000-000000000004','a1520000-0000-4000-8000-000000000004','g015-account','android','G015 account'),
('a1510000-0000-4000-8000-000000000005','a1500000-0000-4000-8000-000000000005','a1520000-0000-4000-8000-000000000005','g015-owner','android','G015 owner');

insert into public.devices(
  id,owner_id,model_code,display_name,category,environment,serial_number,is_demo,
  robot_authority_version,robot_lifecycle,robot_public_key_pem,robot_public_key_fingerprint,
  robot_authorization_epoch,robot_active_boot_id
)
values
('a1530000-0000-4000-8000-000000000001','a1500000-0000-4000-8000-000000000001','thunder','G015 main','四足','室内','G015-001',false,5,'owned',repeat('A',64),repeat('1',64),7,'boot-g015-main'),
('a1530000-0000-4000-8000-000000000002','a1500000-0000-4000-8000-000000000002','thunder','G015 pre','四足','室内','G015-002',false,5,'owned',repeat('B',64),repeat('2',64),7,'boot-g015-pre'),
('a1530000-0000-4000-8000-000000000003','a1500000-0000-4000-8000-000000000003','thunder','G015 post','四足','室内','G015-003',false,5,'owned',repeat('C',64),repeat('3',64),7,'boot-g015-post'),
('a1530000-0000-4000-8000-000000000004','a1500000-0000-4000-8000-000000000004','thunder','G015 account','四足','室内','G015-004',false,5,'owned',repeat('D',64),repeat('4',64),7,'boot-g015-account'),
('a1530000-0000-4000-8000-000000000005','a1500000-0000-4000-8000-000000000005','thunder','G015 owner','四足','室内','G015-005',false,5,'owned',repeat('E',64),repeat('5',64),7,'boot-g015-owner');

-- A single queued row can be claimed by only one worker; begin is a second fenced CAS.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a1520000-0000-4000-8000-000000000001"}',true);
create temporary table g015_main_command as
select public.create_robot_health_check('a1530000-0000-4000-8000-000000000001','g015-main',array['battery'],60) result;
reset role;
create temporary table g015_main_lease as
select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000001',30) result;
select is((select (result->>'claimed')::boolean from g015_main_lease),true,'first worker claims the only queued command');
select is(public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000002',30),null::jsonb,'second worker cannot claim the leased command');
select is((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_main_lease),
  (select (result->>'lease_token')::uuid from g015_main_lease),
  (select (result->>'fencing_token')::bigint+1 from g015_main_lease))->>'reason'),'stale_lease'::text,
  'stale fencing token cannot begin transport');
select is((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_main_lease),gen_random_uuid(),
  (select (result->>'fencing_token')::bigint from g015_main_lease))->>'reason'),'stale_lease'::text,
  'stale lease token cannot begin transport');
select is((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_main_lease),
  (select (result->>'lease_token')::uuid from g015_main_lease),
  (select (result->>'fencing_token')::bigint from g015_main_lease))->>'delivery_status'),'dispatching'::text,
  'matching lease atomically begins transport');
select ok((select c.delivery_status='dispatching' and o.status='dispatching'
  and o.lease_token is not null and o.leased_until is not null
  from public.device_commands c join private.device_command_outbox o on o.command_id=c.id
  where c.id=(select (result->>'command_id')::uuid from g015_main_lease)),
  'begin advances outbox and projection together while retaining the fence');
select is((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_main_lease),
  (select (result->>'lease_token')::uuid from g015_main_lease),
  (select (result->>'fencing_token')::bigint from g015_main_lease))->>'reason'),'stale_lease'::text,
  'a competing begin cannot authorize the same dispatch twice');
select is((public.finish_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_main_lease),
  (select (result->>'lease_token')::uuid from g015_main_lease),
  (select (result->>'fencing_token')::bigint from g015_main_lease),
  'published','transport-g015-main',null)->>'delivery_status'),'published'::text,
  'accepted transport settles dispatching to published');
select ok((select delivery_status='published' and ack_status is null from public.device_commands
  where id=(select (result->>'command_id')::uuid from g015_main_lease)),
  'transport acceptance never invents a device ACK');

-- A leased worker cannot finish without the begin boundary; an expired pre-begin lease is retryable.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a1520000-0000-4000-8000-000000000001"}',true);
create temporary table g015_lease_crash_command as
select public.create_robot_health_check('a1530000-0000-4000-8000-000000000001','g015-lease-crash',array['network'],60) result;
reset role;
create temporary table g015_lease_crash as select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000001',30) result;
select is((public.finish_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_lease_crash),
  (select (result->>'lease_token')::uuid from g015_lease_crash),
  (select (result->>'fencing_token')::bigint from g015_lease_crash),
  'published','must-not-send',null)->>'reason'),'stale_dispatch'::text,
  'leased state cannot finish transport');
update private.device_command_outbox set leased_until=now()-interval '1 second'
where command_id=(select (result->>'command_id')::uuid from g015_lease_crash);
select is(public.reconcile_robot_command_timeouts(1),1,'pre-begin worker crash is reconciled');
select ok((select c.delivery_status='queued' and o.status='queued' and o.last_error_code='lease_expired'
  from public.device_commands c join private.device_command_outbox o on o.command_id=c.id
  where c.id=(select (result->>'command_id')::uuid from g015_lease_crash)),
  'expired lease is safely requeued before any transport began');

-- Once begin succeeds, timeout is ambiguous and terminal; it is never claimable again.
update private.device_command_outbox set available_at=now()
where command_id=(select (result->>'command_id')::uuid from g015_lease_crash);
create temporary table g015_dispatch_crash as select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000002',30) result;
select is((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_dispatch_crash),
  (select (result->>'lease_token')::uuid from g015_dispatch_crash),
  (select (result->>'fencing_token')::bigint from g015_dispatch_crash))->>'delivery_status'),'dispatching'::text,
  'retry is fenced again before transport');
update private.device_command_outbox set leased_until=now()-interval '1 second'
where command_id=(select (result->>'command_id')::uuid from g015_dispatch_crash);
select is(public.reconcile_robot_command_timeouts(1),1,'post-begin worker crash is reconciled');
select ok((select c.delivery_status='delivery_unknown' and o.status='delivery_unknown'
  and o.last_error_code='dispatch_timeout_unknown'
  from public.device_commands c join private.device_command_outbox o on o.command_id=c.id
  where c.id=(select (result->>'command_id')::uuid from g015_dispatch_crash)),
  'expired dispatch is terminal delivery_unknown');
select is(public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000003',30),null::jsonb,
  'ambiguous dispatch cannot be claimed again');

-- Explicit, known transport failure is the only post-begin path that backs off or dead-letters.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1500000-0000-4000-8000-000000000001","role":"authenticated","session_id":"a1520000-0000-4000-8000-000000000001"}',true);
create temporary table g015_failure_command as
select public.create_robot_health_check('a1530000-0000-4000-8000-000000000001','g015-failure',array['sensors'],60) result;
reset role;
create temporary table g015_failure_lease1 as select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000001',30) result;
select ok((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_failure_lease1),
  (select (result->>'lease_token')::uuid from g015_failure_lease1),
  (select (result->>'fencing_token')::bigint from g015_failure_lease1))->>'begun'='true'),
  'first explicit-failure attempt begins');
select is((public.finish_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_failure_lease1),
  (select (result->>'lease_token')::uuid from g015_failure_lease1),
  (select (result->>'fencing_token')::bigint from g015_failure_lease1),
  'transport_failure',null,'connection_refused')->>'delivery_status'),'queued'::text,
  'definitive transport failure backs off');
select ok((select available_at>now() and last_error_code='connection_refused'
  from private.device_command_outbox where command_id=(select (result->>'command_id')::uuid from g015_failure_lease1)),
  'retry records its backoff and error');
update private.device_command_outbox set available_at=now(),max_attempts=2
where command_id=(select (result->>'command_id')::uuid from g015_failure_lease1);
create temporary table g015_failure_lease2 as select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000002',30) result;
select ok((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_failure_lease2),
  (select (result->>'lease_token')::uuid from g015_failure_lease2),
  (select (result->>'fencing_token')::bigint from g015_failure_lease2))->>'begun'='true'),
  'final explicit-failure attempt begins');
select is((public.finish_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_failure_lease2),
  (select (result->>'lease_token')::uuid from g015_failure_lease2),
  (select (result->>'fencing_token')::bigint from g015_failure_lease2),
  'transport_failure',null,'connection_refused')->>'delivery_status'),'dead_letter'::text,
  'retry exhaustion reaches dead letter');

-- Authority revoked between claim and begin authorizes zero sends.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1500000-0000-4000-8000-000000000002","role":"authenticated","session_id":"a1520000-0000-4000-8000-000000000002"}',true);
create temporary table g015_pre_revoke_command as
select public.create_robot_health_check('a1530000-0000-4000-8000-000000000002','g015-pre-revoke',array['battery'],60) result;
reset role;
create temporary table g015_pre_revoke_lease as select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000001',30) result;
update public.account_terminals set revoked_at=now(),revocation_reason='g015_pre_begin'
where id='a1510000-0000-4000-8000-000000000002';
select is((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_pre_revoke_lease),
  (select (result->>'lease_token')::uuid from g015_pre_revoke_lease),
  (select (result->>'fencing_token')::bigint from g015_pre_revoke_lease))->>'begun'),'false'::text,
  'terminal revocation between claim and begin authorizes zero sends');
select ok((select c.delivery_status='cancelled' and o.status='cancelled'
  from public.device_commands c join private.device_command_outbox o on o.command_id=c.id
  where c.id=(select (result->>'command_id')::uuid from g015_pre_revoke_lease)),
  'pre-begin revocation cancels the lease');

-- Revocation after begin is ambiguous and can never return to the queue.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1500000-0000-4000-8000-000000000003","role":"authenticated","session_id":"a1520000-0000-4000-8000-000000000003"}',true);
create temporary table g015_post_revoke_command as
select public.create_robot_health_check('a1530000-0000-4000-8000-000000000003','g015-post-revoke',array['battery'],60) result;
reset role;
create temporary table g015_post_revoke_lease as select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000001',30) result;
select ok((public.begin_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_post_revoke_lease),
  (select (result->>'lease_token')::uuid from g015_post_revoke_lease),
  (select (result->>'fencing_token')::bigint from g015_post_revoke_lease))->>'begun'='true'),
  'post-revocation fixture begins transport');
update public.account_terminals set revoked_at=now(),revocation_reason='g015_post_begin'
where id='a1510000-0000-4000-8000-000000000003';
select ok((select c.delivery_status='revocation_pending' and o.status='revocation_pending'
  and o.lease_token is null and o.leased_until is null
  from public.device_commands c join private.device_command_outbox o on o.command_id=c.id
  where c.id=(select (result->>'command_id')::uuid from g015_post_revoke_lease)),
  'terminal/session revocation after begin is revocation_pending');
select is((public.finish_robot_command_publish(
  (select (result->>'command_id')::uuid from g015_post_revoke_lease),
  (select (result->>'lease_token')::uuid from g015_post_revoke_lease),
  (select (result->>'fencing_token')::bigint from g015_post_revoke_lease),
  'transport_failure',null,'revoked')->>'reason'),'stale_dispatch'::text,
  'revoked dispatch cannot use failure outcome to requeue');

-- Account suspension and ownership/authority mutation cover dispatching too.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1500000-0000-4000-8000-000000000004","role":"authenticated","session_id":"a1520000-0000-4000-8000-000000000004"}',true);
create temporary table g015_account_command as select public.create_robot_health_check('a1530000-0000-4000-8000-000000000004','g015-account',array['network'],60) result;
reset role;
create temporary table g015_account_lease as select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000001',30) result;
select ok((public.begin_robot_command_publish((select (result->>'command_id')::uuid from g015_account_lease),(select (result->>'lease_token')::uuid from g015_account_lease),(select (result->>'fencing_token')::bigint from g015_account_lease))->>'begun'='true'),'account fixture begins');
update public.profiles set account_status='suspended' where id='a1500000-0000-4000-8000-000000000004';
select is((select delivery_status from public.device_commands where id=(select (result->>'command_id')::uuid from g015_account_lease)),'revocation_pending'::text,'account suspension makes dispatch revocation_pending');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1500000-0000-4000-8000-000000000005","role":"authenticated","session_id":"a1520000-0000-4000-8000-000000000005"}',true);
create temporary table g015_owner_command as select public.create_robot_health_check('a1530000-0000-4000-8000-000000000005','g015-owner',array['network'],60) result;
reset role;
create temporary table g015_owner_lease as select public.claim_robot_command_for_publish('a1540000-0000-4000-8000-000000000001',30) result;
select ok((public.begin_robot_command_publish((select (result->>'command_id')::uuid from g015_owner_lease),(select (result->>'lease_token')::uuid from g015_owner_lease),(select (result->>'fencing_token')::bigint from g015_owner_lease))->>'begun'='true'),'ownership fixture begins');
update public.devices set owner_id=null where id='a1530000-0000-4000-8000-000000000005';
select is((select delivery_status from public.device_commands where id=(select (result->>'command_id')::uuid from g015_owner_lease)),'revocation_pending'::text,'ownership change makes dispatch revocation_pending');

-- Published commands still become delivery_unknown when their ACK deadline expires.
update private.device_command_outbox set ack_deadline=now()-interval '1 second'
where command_id=(select (result->>'command_id')::uuid from g015_main_lease);
select is(public.reconcile_robot_command_timeouts(1),1,'published ACK timeout is reconciled');
select is((select delivery_status from public.device_commands where id=(select (result->>'command_id')::uuid from g015_main_lease)),'delivery_unknown'::text,'published ACK timeout remains terminal unknown');

select * from finish();
rollback;
