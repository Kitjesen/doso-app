\set ON_ERROR_STOP on
-- Local test identities and devices. Binding, authority and remote-state SQL load from production migrations.
do $$ begin
  if current_database() not in ('doso_multi_device_verification','doso_multi_device_minimal_verification') then raise exception 'multi_device_requires_isolated_database'; end if;
end $$;
\if :{?reuse_roles}
\else
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
\endif
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id));
create function auth.jwt() returns jsonb language sql stable set search_path='' as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
create function auth.uid() returns uuid language sql stable set search_path='' as $$ select (auth.jwt()->>'sub')::uuid; $$;
grant usage on schema auth,extensions to authenticated,service_role;
\ir ../../migrations/20260822185808_create_doso_accounts_and_devices.sql
\ir ../../migrations/20260822185822_grant_service_role_access.sql
\ir ../../migrations/20260822185835_add_account_terminal_security.sql
\ir ../../migrations/20260822185849_harden_network_backend.sql
\ir ../../migrations/20260825070607_add_account_email_outbox.sql
\if :{?minimal_epoch}
\else
\ir ../../migrations/20260825140714_add_robot_command_persistence.sql
\endif
\ir ../../migrations/20261016155923_require_auth_session_authority.sql
\ir ../../migrations/20261103140000_add_device_authorization_epoch.sql
\ir ../../migrations/20261103150000_add_remote_state.sql

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
\set owner '11111111-1111-4111-8111-111111111111'
\set other '22222222-2222-4222-8222-222222222222'
\set first 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set second 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
insert into auth.users(id,email) values(:'owner','owner@local.test'),(:'other','other@local.test');
insert into auth.sessions values('11111111-1111-4111-8111-111111111110',:'owner');
insert into public.account_terminals(user_id,auth_session_id,installation_id,platform,device_label)
values(:'owner','11111111-1111-4111-8111-111111111110','multi-device-local','web','Local database verification');
insert into public.devices(id,owner_id,serial_number,model_code,display_name,category,environment) values
(:'first',null,'LOCAL-DOG-1','thunder','Local dog 1','quadruped','local'),
(:'second',null,'LOCAL-DOG-2','thunder','Local dog 2','quadruped','local'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc',null,'LOCAL-RACE','thunder','Local race','quadruped','local'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd',null,'LOCAL-INVALID','thunder','Invalid claims','quadruped','local');
set role service_role;
select public.rotate_device_claim(:'first',repeat('d',64),now()+interval '10 minutes');
select pg_temp.assert((public.claim_device_with_digest(:'owner','LOCAL-DOG-1',repeat('d',64))).owner_id=:'owner','first dog claimed before upgrade');
reset role;
select pg_temp.assert(to_regclass('public.devices_one_physical_per_owner_idx') is not null,'upgrade starts with deployed one-device constraint');
select pg_temp.assert((select robot_authorization_epoch=2 from public.devices where id=:'first'),'claim advances epoch exactly once');
\ir ../../migrations/20261103170000_allow_multiple_owned_devices.sql
\ir ../../migrations/20261104090000_claim_device_by_uuid.sql
select pg_temp.assert(to_regclass('public.devices_one_physical_per_owner_idx') is null,'owner restriction removed');
select pg_temp.expect_sqlstate($sql$insert into public.devices(owner_id,serial_number,model_code,display_name,category,environment)
values(null,'LOCAL-DOG-1','thunder','duplicate','quadruped','local')$sql$,'23505');
select pg_temp.assert(not has_function_privilege('authenticated','public.claim_device_with_digest(uuid,text,text)','execute')
 and not has_function_privilege('anon','public.claim_device_with_digest(uuid,text,text)','execute')
 and has_function_privilege('service_role','public.claim_device_with_digest(uuid,text,text)','execute'),'claim remains service-only');
select pg_temp.assert(not has_function_privilege('authenticated','public.claim_device_with_digest(uuid,uuid,text)','execute')
 and not has_function_privilege('anon','public.claim_device_with_digest(uuid,uuid,text)','execute')
 and has_function_privilege('service_role','public.claim_device_with_digest(uuid,uuid,text)','execute'),'UUID claim remains service-only');
\echo PASS upgrade_preserves_device_identity_and_rpc_permissions
set role service_role;
select public.rotate_device_claim(:'second',repeat('a',64),now()+interval '10 minutes');
select pg_temp.assert((public.claim_device_with_digest(:'owner'::uuid,:'second'::uuid,repeat('a',64))).owner_id=:'owner','second dog claimed by same owner');
select pg_temp.assert((public.claim_device_with_digest(:'other','LOCAL-DOG-2',repeat('a',64))).id is null,'another account cannot take owned dog');
select pg_temp.assert((public.claim_device_with_digest(:'owner','LOCAL-DOG-2',repeat('a',64))).id is null,'claim consumed once');
reset role;
select pg_temp.assert((select count(*)=2 from public.devices where owner_id=:'owner' and not is_demo),'both dogs remain owned');
select pg_temp.assert((select consumed_by=:'owner' and consumed_at is not null from private.device_claims where device_id=:'second'),'successful claim consumed atomically');
\echo PASS same_owner_two_dogs_and_cross_owner_rejection

set role service_role;
select public.rotate_device_claim('dddddddd-dddd-4ddd-8ddd-dddddddddddd',repeat('b',64),now()+interval '10 minutes');
select pg_temp.assert((public.claim_device_with_digest(:'owner','LOCAL-INVALID',null)).id is null,'null digest rejected');
select pg_temp.assert((public.claim_device_with_digest(:'owner','LOCAL-INVALID',repeat('c',64))).id is null,'wrong digest rejected');
reset role;
select pg_temp.assert((select attempt_count=2 and consumed_at is null from private.device_claims where device_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'invalid attempts counted');
update private.device_claims set attempt_count=max_attempts where device_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set role service_role;
select pg_temp.assert((public.claim_device_with_digest(:'owner','LOCAL-INVALID',repeat('b',64))).id is null,'exhausted claim rejected');
select public.rotate_device_claim('dddddddd-dddd-4ddd-8ddd-dddddddddddd',repeat('b',64),now()-interval '1 second');
select pg_temp.assert((public.claim_device_with_digest(:'owner','LOCAL-INVALID',repeat('b',64))).id is null,'expired claim rejected');
reset role;
select pg_temp.assert((select owner_id is null from public.devices where serial_number='LOCAL-INVALID'),'invalid claims leave ownership unchanged');
update public.profiles set account_status='suspended' where id=:'other';
select pg_temp.expect_sqlstate(format('select public.claim_device_with_digest(%L,%L,%L)',:'other','LOCAL-INVALID',repeat('b',64)),'P0001');
update public.profiles set account_status='active' where id=:'other';
\echo PASS claim_digest_expiry_attempt_and_account_guards

set role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',:'owner','session_id','11111111-1111-4111-8111-111111111110')::text,false);
select pg_temp.assert((select count(*)=2 from public.devices where not is_demo),'RLS lists both owned dogs');
select pg_temp.assert(public.set_remote_state(:'first',true,1) @> '{"enabled":true,"revision":2}','enable first');
select pg_temp.assert(public.get_remote_state(:'second') @> '{"enabled":false,"revision":1}','second still off');
select pg_temp.assert(public.set_remote_state(:'second',true,1) @> '{"enabled":true,"revision":2}','enable second independently');
select pg_temp.assert(public.set_remote_state(:'first',false,2) @> '{"enabled":false,"revision":3}','disable first');
select pg_temp.assert(public.get_remote_state(:'second') @> '{"enabled":true,"revision":2}','second remains on');
\echo PASS remote_state_independent_per_device
reset role;
set role service_role;
select pg_temp.assert((public.unbind_device(:'second',:'other',false)).id is null,'other account cannot unbind second');
select pg_temp.assert((public.unbind_device(:'first',:'owner',false)).id=:'first','unbind first only');
reset role;
select pg_temp.assert((select owner_id is null from public.devices where id=:'first'),'first unbound');
select pg_temp.assert((select owner_id=:'owner' from public.devices where id=:'second'),'second ownership preserved');
select pg_temp.assert((select robot_authorization_epoch=3 from public.devices where id=:'first'),'unbind advances epoch exactly once');
select pg_temp.assert((select robot_authorization_epoch=2 from public.devices where id=:'second'),'other device epoch preserved');
set role authenticated;
select pg_temp.assert(public.get_remote_state(:'second') @> '{"enabled":true,"revision":2}','second remote state preserved after first unbind');
select pg_temp.expect_sqlstate(format('select public.get_remote_state(%L)',:'first'),'42501');
reset role;
select pg_temp.assert((select not enabled and owner_id is null from private.device_remote_state where device_id=:'first'),'unbind invalidates first remote state');
\echo PASS unbind_one_preserves_other_ownership_and_remote_state
set role service_role;
select public.rotate_device_claim('cccccccc-cccc-4ccc-8ccc-cccccccccccc',repeat('c',64),now()+interval '10 minutes');
reset role;
\ir device_authorization_epoch.test.sql
\if :{?minimal_epoch}
select pg_temp.assert(to_regclass('public.device_commands') is null
  and to_regprocedure('public.create_robot_health_check(uuid,text,text[],integer)') is null,
  'minimal deployment has no command tables or RPC');
\echo PASS minimal_epoch_remote_state_multi_device_path
\ir ../../migrations/20260825140714_add_robot_command_persistence.sql
select pg_temp.assert(to_regprocedure('private.enforce_device_authorization_epoch()') is null,
  'full migration removes minimal trigger function');
select pg_temp.assert((select robot_authorization_epoch=3 from public.devices where id=:'first')
  and (select robot_authorization_epoch=2 from public.devices where id=:'second'),'upgrade preserves epochs');
\ir device_authorization_epoch.test.sql
\echo PASS minimal_then_full_single_epoch_authority
\else
select pg_temp.assert(to_regprocedure('private.enforce_device_authorization_epoch()') is null,
  'minimal migration preserves full trigger as sole authority');
\echo PASS full_then_minimal_single_epoch_authority
\endif
