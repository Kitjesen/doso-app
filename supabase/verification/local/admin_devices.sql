\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'doso_admin_device_verification' then
    raise exception 'admin_devices_requires_isolated_database';
  end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
create function auth.jwt() returns jsonb language sql stable set search_path='' as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
create function auth.uid() returns uuid language sql stable set search_path='' as $$ select (auth.jwt()->>'sub')::uuid; $$;
grant usage on schema auth,extensions to authenticated,service_role;
\ir ../../migrations/20260822185808_create_doso_accounts_and_devices.sql
\ir ../../migrations/20260822185822_grant_service_role_access.sql
\ir ../../migrations/20260822185835_add_account_terminal_security.sql
\ir ../../migrations/20260822185849_harden_network_backend.sql
\ir ../../migrations/20261103140000_add_device_authorization_epoch.sql
\ir ../../migrations/20261103150000_add_remote_state.sql
\ir ../../migrations/20261103170000_allow_multiple_owned_devices.sql
\ir ../../migrations/20261104090000_claim_device_by_uuid.sql
\ir ../../migrations/20261104100000_create_device_inventory.sql

create function pg_temp.assert(p_condition boolean,p_message text) returns void language plpgsql as $$
begin if p_condition is not true then raise exception 'assertion_failed %',p_message; end if; end;
$$;
create function pg_temp.expect_sqlstate(p_sql text,p_code text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate=p_code then return; end if;
    raise exception 'expected SQLSTATE %, got % %',p_code,sqlstate,sqlerrm;
  end;
  raise exception 'expected SQLSTATE %, query succeeded',p_code;
end;
$$;

insert into auth.users(id,email) values
('11111111-1111-4111-8111-111111111111','admin@local.test'),
('22222222-2222-4222-8222-222222222222','owner@local.test'),
('33333333-3333-4333-8333-333333333333','suspended@local.test');
update public.profiles set app_role='admin' where id='11111111-1111-4111-8111-111111111111';
update public.profiles set app_role='admin',account_status='suspended' where id='33333333-3333-4333-8333-333333333333';

select pg_temp.assert(not has_function_privilege('anon','public.create_device_inventory(uuid,text,text,text,text,text,text,text)','execute')
  and not has_function_privilege('authenticated','public.create_device_inventory(uuid,text,text,text,text,text,text,text)','execute')
  and has_function_privilege('service_role','public.create_device_inventory(uuid,text,text,text,text,text,text,text)','execute')
  and not has_function_privilege('service_role','private.require_device_admin(uuid)','execute'),'inventory RPC and admin helper privileges');
select pg_temp.assert(not has_function_privilege('anon','public.admin_rotate_device_claim(uuid,uuid,text,timestamptz,text,text)','execute')
  and not has_function_privilege('authenticated','public.admin_rotate_device_claim(uuid,uuid,text,timestamptz,text,text)','execute')
  and has_function_privilege('service_role','public.admin_rotate_device_claim(uuid,uuid,text,timestamptz,text,text)','execute')
  and not has_function_privilege('anon','public.admin_unbind_device(uuid,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.admin_unbind_device(uuid,uuid,text,text)','execute')
  and has_function_privilege('service_role','public.admin_unbind_device(uuid,uuid,text,text)','execute'),'rotation and unbind RPC privileges');
\echo PASS administrator_mutations_are_service_only

set role service_role;
select (public.create_device_inventory('11111111-1111-4111-8111-111111111111',
 ' local-normal ', ' Thunder ', 'Local device', '四足', '室外', 'verification', 'request-create')).id;
reset role;
select pg_temp.assert((select count(*)=1 from public.devices where serial_number='LOCAL-NORMAL'
 and model_code='Thunder' and owner_id is null and not is_demo and safety_lock
 and connection_status='offline' and battery_percent is null),'created inventory preserves safe defaults');
select pg_temp.assert((select count(*)=1 from public.audit_logs a join public.devices d on a.resource_id=d.id::text
 where d.serial_number='LOCAL-NORMAL' and a.action='device.inventory_created' and a.resource_type='device'
 and a.actor_user_id='11111111-1111-4111-8111-111111111111'
 and a.metadata=jsonb_build_object('serialNumber','LOCAL-NORMAL','reason','verification',
 'actorRole','admin','outcome','success','requestId','request-create')),'inventory audit committed with device');
\echo PASS inventory_and_success_audit_commit_together

set role service_role;
select pg_temp.expect_sqlstate($sql$select public.create_device_inventory('11111111-1111-4111-8111-111111111111',
 'local-normal','Thunder','Duplicate','四足','室外','verification','duplicate')$sql$,'23505');
reset role;
select pg_temp.assert((select count(*)=1 from public.devices) and (select count(*)=1 from public.audit_logs),
 'duplicate normalized serial adds neither inventory nor audit');
\echo PASS normalized_duplicate_serial_is_atomic

set role service_role;
select pg_temp.expect_sqlstate($sql$select public.create_device_inventory('11111111-1111-4111-8111-111111111111',
 'INVALID-MODEL',' ','Invalid','四足','室外','verification','invalid')$sql$,'22023');
select pg_temp.expect_sqlstate($sql$select public.create_device_inventory('11111111-1111-4111-8111-111111111111',
 'INVALID-CATEGORY','Thunder','Invalid','robot','室外','verification','invalid')$sql$,'22023');
select pg_temp.expect_sqlstate($sql$select public.create_device_inventory('22222222-2222-4222-8222-222222222222',
 'USER-REJECTED','Thunder','Invalid','四足','室外','verification','invalid')$sql$,'42501');
select pg_temp.expect_sqlstate($sql$select public.create_device_inventory('33333333-3333-4333-8333-333333333333',
 'SUSPENDED-REJECTED','Thunder','Invalid','四足','室外','verification','invalid')$sql$,'42501');
select pg_temp.expect_sqlstate($sql$select public.admin_rotate_device_claim('22222222-2222-4222-8222-222222222222',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),now()+interval '1 hour','verification','invalid')$sql$,'42501');
select pg_temp.expect_sqlstate($sql$select public.admin_unbind_device('33333333-3333-4333-8333-333333333333',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','verification','invalid')$sql$,'42501');
reset role;
select pg_temp.assert((select count(*)=1 from public.devices) and (select count(*)=1 from public.audit_logs),
 'invalid values or actors leave storage untouched');
\echo PASS invalid_values_and_inactive_or_non_admin_actors_are_rejected

create function public.fixture_reject_admin_audit() returns trigger language plpgsql as $$
begin
  if new.metadata->>'reason'='reject-audit' then raise exception 'fixture_audit_unavailable'; end if;
  return new;
end;
$$;
create trigger fixture_reject_admin_audit before insert on public.audit_logs
for each row execute function public.fixture_reject_admin_audit();
set role service_role;
select pg_temp.expect_sqlstate($sql$select public.create_device_inventory('11111111-1111-4111-8111-111111111111',
 'LOCAL-ROLLBACK','Thunder','Rollback','四足','室外','reject-audit','failed-create')$sql$,'P0001');
reset role;
select pg_temp.assert(not exists(select 1 from public.devices where serial_number='LOCAL-ROLLBACK')
 and not exists(select 1 from public.audit_logs where metadata->>'requestId'='failed-create'),
 'failed creation audit rolls back inventory and trigger-created remote state');
set role service_role;
select (public.create_device_inventory('11111111-1111-4111-8111-111111111111',
 'LOCAL-ROLLBACK','Thunder','Retried','四足','室外','verification','retry-create')).id;
reset role;
select pg_temp.assert((select count(*)=1 from public.devices where serial_number='LOCAL-ROLLBACK')
 and (select count(*)=1 from public.audit_logs where metadata->>'requestId'='retry-create'),
 'retry succeeds exactly once after rollback');
\echo PASS audit_failure_rolls_back_inventory_and_allows_retry

set role service_role;
select pg_temp.assert(public.admin_rotate_device_claim('11111111-1111-4111-8111-111111111111',
 (select id from public.devices where serial_number='LOCAL-NORMAL'),repeat('a',64),now()+interval '1 hour',
 'verification','rotate-success'),'rotation succeeds');
select pg_temp.expect_sqlstate($sql$select public.admin_rotate_device_claim('11111111-1111-4111-8111-111111111111',
 (select id from public.devices where serial_number='LOCAL-NORMAL'),repeat('b',64),now()+interval '2 hours',
 'reject-audit','rotate-failure')$sql$,'P0001');
select pg_temp.assert(not public.admin_rotate_device_claim('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('b',64),now()+interval '1 hour','verification','rotate-missing'),
 'missing rotation target returns false');
reset role;
select pg_temp.assert((select code_digest=repeat('a',64) from private.device_claims c join public.devices d on c.device_id=d.id
 where d.serial_number='LOCAL-NORMAL'),'failed rotation audit preserves previous binding code');
select pg_temp.assert((select count(*)=1 from public.audit_logs where action='device.binding_code_rotated')
 and not exists(select 1 from public.audit_logs where metadata ?| array['code','codeDigest','digest','bindingCode']),
 'rotation audits success without private claim material');
\echo PASS binding_rotation_and_audit_roll_back_together

update public.devices set owner_id='22222222-2222-4222-8222-222222222222',connection_status='online',
 safety_lock=false,battery_percent=60,runtime_hours=12,last_seen_at=now() where serial_number='LOCAL-NORMAL';
update private.device_remote_state set enabled=true where device_id=(select id from public.devices where serial_number='LOCAL-NORMAL');
set role service_role;
select pg_temp.expect_sqlstate($sql$select public.admin_unbind_device('11111111-1111-4111-8111-111111111111',
 (select id from public.devices where serial_number='LOCAL-NORMAL'),'reject-audit','unbind-failure')$sql$,'P0001');
reset role;
select pg_temp.assert((select d.owner_id='22222222-2222-4222-8222-222222222222' and d.robot_authorization_epoch=2
 and d.connection_status='online' and not d.safety_lock and r.enabled and r.owner_id=d.owner_id
 from public.devices d join private.device_remote_state r on r.device_id=d.id where d.serial_number='LOCAL-NORMAL'),
 'failed unbind audit restores ownership, epoch, safety and remote permission');
set role service_role;
select (public.admin_unbind_device('11111111-1111-4111-8111-111111111111',
 (select id from public.devices where serial_number='LOCAL-NORMAL'),'verification','unbind-success')).id;
select pg_temp.assert((public.admin_unbind_device('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','verification','unbind-missing')).id is null,'missing unbind target returns null');
reset role;
select pg_temp.assert((select d.owner_id is null and d.robot_authorization_epoch=3 and d.safety_lock
 and d.connection_status='offline' and d.battery_percent is null and d.runtime_hours=0
 and not r.enabled and r.owner_id is null and r.authorization_epoch=3
 from public.devices d join private.device_remote_state r on r.device_id=d.id where d.serial_number='LOCAL-NORMAL'),
 'successful unbind retains existing epoch and remote-consent reset semantics');
select pg_temp.assert((select count(*)=1 from public.audit_logs where action='device.force_unbind'),
 'unbind audited exactly once');
\echo PASS force_unbind_rolls_back_all_side_effects_on_audit_failure
