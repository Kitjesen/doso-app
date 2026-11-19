\set ON_ERROR_STOP on
-- Synthetic Auth/session dependencies, real production migration and PostgreSQL transactions.
do $$ begin
  if current_database()<>'doso_remote_state_fixture' then raise exception 'remote_state_fixture_requires_isolated_database'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key references auth.users(id),active boolean not null default true);
create table public.fixture_sessions(user_id uuid primary key references auth.users(id),active boolean not null default true);
create table public.devices(
  id uuid primary key,owner_id uuid references auth.users(id),is_demo boolean not null default false,
  robot_authorization_epoch bigint not null default 1
);
create function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(current_setting('request.user_id',true),'')::uuid;
$$;
create function private.is_account_active_for(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=p_user_id and active);
$$;
create function private.is_account_active() returns boolean
language sql stable security definer set search_path='' as $$ select private.is_account_active_for(auth.uid()); $$;
create function private.is_session_active() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(current_setting('request.test_session_active',true),'true')='true'
    and exists(select 1 from public.fixture_sessions where user_id=auth.uid() and active);
$$;
grant usage on schema auth,private to authenticated,service_role;
grant execute on function auth.uid(),private.is_account_active(),private.is_session_active() to authenticated;
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
create temporary table fixture_values(key text primary key,value jsonb);
grant all on fixture_values to authenticated,service_role;
create function pg_temp.obs(p_permission jsonb default null,p_received jsonb default null,
  p_connection uuid default '44444444-4444-4444-8444-444444444444',p_reusable boolean default true)
returns jsonb language sql volatile security definer as $$
  select jsonb_build_object('deviceId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','connectionId',p_connection,
    'lastSeenAt',private.remote_time_text(clock_timestamp()),'reachable',p_connection is not null,
    'permission',p_permission,'latest',p_received,'sessionReusable',p_reusable);
$$;
create function pg_temp.decision(p_permission jsonb,p_confirmed boolean default true)
returns jsonb language sql as $$
  select jsonb_build_object('authorizationEpoch',p_permission->'authorizationEpoch',
    'consentVersion',p_permission->'consentVersion','desiredEnabled',p_permission->'enabled',
    'deviceConfirmed',p_confirmed,'reportingSessionId',p_permission->'reportingSessionId','expiresAt',p_permission->'expiresAt');
$$;
create function pg_temp.received(p_permission jsonb,p_seq bigint,p_error boolean default false)
returns jsonb language sql volatile security definer as $$
  select jsonb_build_object('receivedAt',time,'report',
    jsonb_build_object('v',1,'kind','status.report','deviceId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'connectionId',p_permission->'connectionId','reportingSessionId',p_permission->'reportingSessionId',
      'authorizationEpoch',p_permission->'authorizationEpoch','consentVersion',p_permission->'consentVersion',
      'seq',p_seq,'observedAt',time)
    || case when p_error then '{"error":"upstream_unavailable"}'::jsonb
      else '{"status":{"state":{"kind":"CMS_STATE_KIND_STANDING","transition":"CMS_TRANSITION_KIND_NONE"},"control":{"owner":"CONTROL_OWNER_GRPC","motorOutputEnabled":true,"criticalMotorFault":false},"transport":"mtls"}}'::jsonb end)
  from (select private.remote_time_text(clock_timestamp()) as time) t;
$$;
create function pg_temp.sync(p_observation jsonb) returns jsonb language sql volatile as $$
  select nullif(public.sync_remote_state(clock_timestamp(),jsonb_build_array(p_observation)) #> '{permissions,0,permission}','null'::jsonb);
$$;

\set owner '11111111-1111-4111-8111-111111111111'
\set other '22222222-2222-4222-8222-222222222222'
\set device 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
insert into auth.users values(:'owner'),(:'other');
insert into public.profiles select id,true from auth.users;
insert into public.fixture_sessions select id,true from auth.users;
insert into public.devices(id,owner_id,is_demo) values
 (:'device',:'owner',false),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',:'other',false),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',:'owner',true),('dddddddd-dddd-4ddd-8ddd-dddddddddddd',null,false);
set role authenticated;
select set_config('request.user_id',:'owner',false);
select pg_temp.assert(public.get_remote_state(:'device') @> '{"enabled":false,"revision":1,"activation":"off","fresh":false,"latest":null,"lastSuccess":null}','default off');
select pg_temp.assert(public.set_remote_state(:'device',false,1)->>'revision'='1','same selection keeps revision');
reset role;
select pg_temp.assert((select session_id is null from private.device_remote_state where device_id=:'device'),'get does not allocate sampling session');
set role service_role;
insert into fixture_values values('disabled',pg_temp.sync(pg_temp.obs()));
select pg_temp.assert((select value @> '{"enabled":false,"consentVersion":1}' from fixture_values where key='disabled'),'default sync returns disabled only');
select pg_temp.assert(pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='disabled')))) is null,'confirmed unchanged off does not regenerate deadline');
select pg_temp.assert(public.sync_remote_state(clock_timestamp(),jsonb_build_array(
  jsonb_set(pg_temp.obs(),'{deviceId}','"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"'))) #> '{permissions,0,permission}'='null'::jsonb,'unknown has no permission');
select pg_temp.assert(public.sync_remote_state(clock_timestamp(),jsonb_build_array(
  jsonb_set(pg_temp.obs(),'{deviceId}','"dddddddd-dddd-4ddd-8ddd-dddddddddddd"'))) #>> '{permissions,0,permission,enabled}'='false','unowned known device remains disabled');
\echo PASS default_off_and_permissions

reset role;
select pg_temp.assert((select not gateway_reachable and last_seen_at is null and latest is null
  from private.device_remote_state where device_id=:'device'),'default off never persists incoming online visibility or state');
set role authenticated;
select pg_temp.assert(public.set_remote_state(:'device',true,1) @> '{"enabled":true,"revision":2,"activation":"unavailable"}','explicit enable waits for connection visibility');
select pg_temp.expect_sqlstate(format('select public.set_remote_state(%L,false,1)',:'device'),'40001');
set role service_role;
insert into fixture_values values('grant',pg_temp.sync(pg_temp.obs()));
select pg_temp.assert((select value @> '{"enabled":true,"consentVersion":2}' from fixture_values where key='grant'),'sync creates collection grant');
select pg_temp.assert(pg_temp.sync(pg_temp.obs())->>'expiresAt'=(select value->>'expiresAt' from fixture_values where key='grant'),'unmatched projection retries exact grant');
insert into fixture_values values('success',pg_temp.received((select value from fixture_values where key='grant'),1));
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='grant')),(select value from fixture_values where key='success')));
reset role;
set role authenticated;
select pg_temp.assert(public.get_remote_state(:'device') @> '{"activation":"on","fresh":true}','matched ack and success are on and fresh');
select pg_temp.assert(not(public.get_remote_state(:'device')->'latest' ?| array['report','seq','connectionId','reportingSessionId']),'public sample omits internal wire IDs');
reset role;
insert into fixture_values values('original-success',(select last_success from private.device_remote_state where device_id=:'device'));
-- A clock fixture exercises the renewal threshold without waiting in real time.
update private.device_remote_state set expires_at=date_trunc('milliseconds',clock_timestamp())+interval '14 seconds',
  confirmed_until=date_trunc('milliseconds',clock_timestamp())+interval '14 seconds' where device_id=:'device';
update fixture_values set value=jsonb_set(value,'{expiresAt}',to_jsonb(private.remote_time_text(
  (select expires_at from private.device_remote_state where device_id=:'device')))) where key='grant';
set role service_role;
insert into fixture_values values('renewed',pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='grant')))));
select pg_temp.assert((select value->>'reportingSessionId' from fixture_values where key='renewed')=(select value->>'reportingSessionId' from fixture_values where key='grant'),'renewal retains session without App keepalive');
select pg_temp.assert((select value->>'expiresAt' from fixture_values where key='renewed')>(select value->>'expiresAt' from fixture_values where key='grant'),'renewal advances deadline');
reset role;
update private.device_remote_state set expires_at=date_trunc('milliseconds',clock_timestamp())+interval '14 seconds',
  confirmed_until=date_trunc('milliseconds',clock_timestamp())+interval '10 seconds' where device_id=:'device';
insert into fixture_values values('prior-ack',jsonb_set((select value from fixture_values where key='renewed'),
  '{expiresAt}',to_jsonb(private.remote_time_text((select confirmed_until from private.device_remote_state where device_id=:'device')))));
insert into fixture_values values('current-issued',jsonb_set((select value from fixture_values where key='renewed'),
  '{expiresAt}',to_jsonb(private.remote_time_text((select expires_at from private.device_remote_state where device_id=:'device')))));
set role service_role;
insert into fixture_values values('prior-ack-retry',pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='prior-ack')))));
select pg_temp.assert((select value->>'expiresAt' from fixture_values where key='prior-ack-retry')=
  (select value->>'expiresAt' from fixture_values where key='current-issued'),'old still-live ACK cannot extend a newer issued deadline');
insert into fixture_values values('current-ack-renewed',pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='current-issued')))));
select pg_temp.assert((select value->>'expiresAt' from fixture_values where key='current-ack-renewed')>
  (select value->>'expiresAt' from fixture_values where key='current-issued'),'ACK of exact current issued deadline permits extension');
update fixture_values set value=(select value from fixture_values where key='current-ack-renewed') where key='renewed';
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed'),false),
  jsonb_set((select value from fixture_values where key='success'),'{receivedAt}',
    to_jsonb(to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))));
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed'),false),
  pg_temp.received((select value from fixture_values where key='renewed'),2,true)));
reset role;
select pg_temp.assert((select last_success=(select value from fixture_values where key='original-success') and last_seq=2 from private.device_remote_state where device_id=:'device'),'error preserves original success and timestamps');
set role authenticated;
select pg_temp.assert(public.get_remote_state(:'device') @> '{"activation":"on","fresh":false,"latest":{"error":"upstream_unavailable"}}','error separate from live confirmation');
\echo PASS user_enable_ack_renew_error

reset role;
set role service_role;
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed')),
  jsonb_set(pg_temp.received((select value from fixture_values where key='renewed'),3),'{report,authorizationEpoch}','2')));
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed')),
  jsonb_set(pg_temp.received((select value from fixture_values where key='renewed'),3),'{report,consentVersion}','1')));
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed')),
  jsonb_set(pg_temp.received((select value from fixture_values where key='renewed'),3),'{report,reportingSessionId}','"55555555-5555-4555-8555-555555555555"')));
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed')),
  jsonb_set(pg_temp.received((select value from fixture_values where key='renewed'),3),'{report,seq}','9007199254740992')));
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed')),
  jsonb_set(pg_temp.received((select value from fixture_values where key='renewed'),3),'{report,status,state,kind}','null')));
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed')),
  jsonb_set(pg_temp.received((select value from fixture_values where key='renewed'),3),'{report,observedAt}','"9999-01-01T00:00:00.000Z"')));
reset role;
select pg_temp.assert((select last_seq=2 and latest #>> '{report,error}'='upstream_unavailable' from private.device_remote_state where device_id=:'device'),'invalid reports cannot replace latest');
set role service_role;
select pg_temp.expect_sqlstate('select public.sync_remote_state(clock_timestamp()-interval ''16 seconds'',''[]''::jsonb)','22023');
select pg_temp.expect_sqlstate('select public.sync_remote_state(clock_timestamp()+interval ''3 seconds'',''[]''::jsonb)','22023');
reset role;
insert into fixture_values values('watermark',to_jsonb((select gateway_observed_at from private.device_remote_state where device_id=:'device')));
set role service_role;
select pg_temp.assert(public.sync_remote_state(((select value #>> '{}' from fixture_values where key='watermark')::timestamptz)-interval '1 second',
  jsonb_build_array(pg_temp.obs(null,null,'66666666-6666-4666-8666-666666666666'))) #> '{permissions,0,permission}'='null'::jsonb,'older batch cannot restore old connection');
\echo PASS replay_and_malformed_reports

select pg_temp.assert(pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed')),null,
  '44444444-4444-4444-8444-444444444444',false)) is null,'matching rejected session freezes current deadline');
select pg_temp.assert(pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='renewed')),null,
  '44444444-4444-4444-8444-444444444444',true)) is null,'later reusable flag cannot revive rejected session');
reset role;
select pg_temp.assert((select session_id::text=(select value->>'reportingSessionId' from fixture_values where key='renewed')
  and expires_at=(select (value->>'expiresAt')::timestamptz from fixture_values where key='renewed')
  from private.device_remote_state where device_id=:'device'),'freeze preserves maximum issued deadline');
set role service_role;
insert into fixture_values values('reconnected',pg_temp.sync(pg_temp.obs(null,null,'66666666-6666-4666-8666-666666666666')));
select pg_temp.assert((select value->>'reportingSessionId' from fixture_values where key='reconnected')<>
  (select value->>'reportingSessionId' from fixture_values where key='renewed'),'new connection immediately gets a new session');
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='reconnected')),
  pg_temp.received((select value from fixture_values where key='renewed'),99), '66666666-6666-4666-8666-666666666666'));
reset role;
select pg_temp.assert((select last_seq=0 from private.device_remote_state where device_id=:'device'),'old session report cannot enter new connection');
update private.device_remote_state set expires_at=clock_timestamp()-interval '1 millisecond' where device_id=:'device';
set role service_role;
insert into fixture_values values('expired-replacement',pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='reconnected')),null,
  '66666666-6666-4666-8666-666666666666')));
select pg_temp.assert((select value->>'reportingSessionId' from fixture_values where key='expired-replacement')<>
  (select value->>'reportingSessionId' from fixture_values where key='reconnected'),'expired session is replaced rather than revived');
reset role;
update private.device_remote_state set expires_at=date_trunc('milliseconds',clock_timestamp())+interval '14 seconds',confirmed_until=null
  where device_id=:'device';
insert into fixture_values values('unconfirmed',jsonb_set((select value from fixture_values where key='expired-replacement'),
  '{expiresAt}',to_jsonb(private.remote_time_text((select expires_at from private.device_remote_state where device_id=:'device')))));
set role service_role;
insert into fixture_values values('unconfirmed-retry',pg_temp.sync(pg_temp.obs(
  pg_temp.decision((select value from fixture_values where key='unconfirmed'),false),null,'66666666-6666-4666-8666-666666666666')));
select pg_temp.assert((select value->>'expiresAt' from fixture_values where key='unconfirmed-retry')=
  (select value->>'expiresAt' from fixture_values where key='unconfirmed'),'missing ACK cannot extend the issued deadline');
reset role;
update private.device_remote_state set expires_at=clock_timestamp()-interval '1 millisecond' where device_id=:'device';
set role service_role;
insert into fixture_values values('after-unconfirmed-expiry',pg_temp.sync(pg_temp.obs(
  pg_temp.decision((select value from fixture_values where key='unconfirmed'),false),null,'66666666-6666-4666-8666-666666666666')));
select pg_temp.assert((select value->>'reportingSessionId' from fixture_values where key='after-unconfirmed-expiry')<>
  (select value->>'reportingSessionId' from fixture_values where key='unconfirmed'),'unconfirmed session rotates after its deadline');
begin;
set role authenticated;
select pg_temp.assert(public.set_remote_state(:'device',false,2) @>
  '{"enabled":false,"revision":3,"activation":"disabling","reachable":false,"fresh":false,"lastSeenAt":null,"latest":null}',
  'close immediately hides current status while awaiting actual device confirmation');
set role service_role;
insert into fixture_values values('close-decision',pg_temp.sync(pg_temp.obs(
  pg_temp.decision((select value from fixture_values where key='after-unconfirmed-expiry')),
  pg_temp.received((select value from fixture_values where key='after-unconfirmed-expiry'),20),
  '66666666-6666-4666-8666-666666666666')));
set role authenticated;
select pg_temp.assert(public.get_remote_state(:'device')->>'activation'='disabling','old enabled ACK cannot confirm a close');
set role service_role;
select pg_temp.assert(pg_temp.sync(pg_temp.obs(
  pg_temp.decision((select value from fixture_values where key='close-decision')),null,
  '66666666-6666-4666-8666-666666666666')) is null,'matching device close ACK needs no repeated disabled grant');
set role authenticated;
select pg_temp.assert(public.get_remote_state(:'device') @>
  '{"activation":"off","reachable":false,"fresh":false,"lastSeenAt":null,"latest":null}','confirmed close remains private');
reset role;
select pg_temp.assert((select not gateway_reachable and last_seen_at is null and latest is null
  from private.device_remote_state where device_id=:'device'),'off sync never persists incoming online or state fields');
rollback;
set role service_role;
\echo PASS sessions_and_lease_wait

reset role;
set role authenticated;
select set_config('request.user_id',:'other',false);
select pg_temp.expect_sqlstate(format('select public.get_remote_state(%L)',:'device'),'42501');
select pg_temp.expect_sqlstate(format('select public.set_remote_state(%L,false,2)',:'device'),'42501');
select pg_temp.expect_sqlstate('select * from private.device_remote_state','42501');
select pg_temp.expect_sqlstate('select public.sync_remote_state(clock_timestamp(),''[]''::jsonb)','42501');
select set_config('request.user_id',:'owner',false);
select set_config('request.test_session_active','false',false);
select pg_temp.expect_sqlstate(format('select public.get_remote_state(%L)',:'device'),'42501');
select set_config('request.test_session_active','true',false);
reset role;
set role anon;
select pg_temp.expect_sqlstate(format('select public.get_remote_state(%L)',:'device'),'42501');
reset role;
update public.profiles set active=false where id=:'owner';
set role service_role;
select pg_temp.assert(pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='after-unconfirmed-expiry')),null,
  '66666666-6666-4666-8666-666666666666')) @> '{"enabled":false,"consentVersion":3}','inactive account persists a newer disable');
reset role;
select pg_temp.assert((select not enabled and revision=3 from private.device_remote_state where device_id=:'device'),'inactive choice remains off');
update public.profiles set active=true where id=:'owner';
update public.devices set owner_id=null,robot_authorization_epoch=2 where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.devices set owner_id=:'other',robot_authorization_epoch=2 where id=:'device';
select pg_temp.assert((select not enabled and revision=1 and latest is null and last_success is null and session_id is null
  from private.device_remote_state where device_id=:'device'),'new owner gets default off and no old history');
set role authenticated;
select set_config('request.user_id',:'other',false);
select pg_temp.assert(public.get_remote_state(:'device') @> '{"enabled":false,"revision":1,"lastSuccess":null}','new owner reads only reset projection');
reset role;
\echo PASS ownership_account_and_privileges

-- Prepare a real independent-backend close/report race.
update public.devices set owner_id=:'owner',robot_authorization_epoch=3 where id=:'device';
set role authenticated;
select set_config('request.user_id',:'owner',false);
select public.set_remote_state(:'device',true,1);
set role service_role;
insert into fixture_values values('race-grant',pg_temp.sync(pg_temp.obs()));
select pg_temp.sync(pg_temp.obs(pg_temp.decision((select value from fixture_values where key='race-grant')),
  pg_temp.received((select value from fixture_values where key='race-grant'),1)));
select 'RACE_OBSERVATION=' || pg_temp.obs(pg_temp.decision((select value from fixture_values where key='race-grant')),
  pg_temp.received((select value from fixture_values where key='race-grant'),2))::text;
