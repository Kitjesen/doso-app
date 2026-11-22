\set ON_ERROR_STOP on
begin;
\ir ../../migrations/20261104100000_create_device_inventory.sql
\ir ../../migrations/20261107100000_add_simulated_devices.sql
\ir ../../migrations/20261108020000_add_telemetry_export.sql
\ir ../../migrations/20261109010000_add_history_access.sql

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

\set device '99999999-9999-4999-8999-999999999999'
\set owner '11111111-1111-4111-8111-111111111111'
\set other '22222222-2222-4222-8222-222222222222'
\set session '22222222-2222-4222-8222-222222222220'
insert into auth.sessions values(:'session',:'other');
insert into public.account_terminals(user_id,auth_session_id,installation_id,platform,device_label)
  values(:'other',:'session','history-other','web','History other');
insert into public.devices(id,owner_id,serial_number,model_code,display_name,category,environment,is_simulated)
  values(:'device',:'owner','LOCAL-HISTORY','thunder','History','quadruped','local',true);
insert into public.devices(id,owner_id,serial_number,model_code,display_name,category,environment,is_simulated)
  values('88888888-8888-4888-8888-888888888888',:'owner','LOCAL-HISTORY-EXISTING','thunder','Existing history','quadruped','local',true);
select public.configure_telemetry_export('88888888-8888-4888-8888-888888888888',true);
create temp table mapping_before_projection as select to_jsonb(m) as value from private.telemetry_devices m;
\ir ../../migrations/20261112010000_private_history_projection.sql
select pg_temp.assert((select history_id is not null and to_jsonb(m)-'history_id'=(select value from mapping_before_projection)
  from private.telemetry_devices m where device_id='88888888-8888-4888-8888-888888888888'),
  'history identity backfills existing mappings without changing authorization or delivery truth');
select pg_temp.assert(not (private.remote_sample_dto('{"report":{"observedAt":"2026-11-12T00:00:00.000Z","status":{"transport":"mtls","location":{"accuracyM":null}}},"receivedAt":"2026-11-12T00:00:00.000Z"}'::jsonb)#>'{status}' ? 'transport')
  and private.remote_sample_dto('{"report":{"status":{"transport":"mtls","location":{"accuracyM":null}}}}'::jsonb)#>'{status,location,accuracyM}'='null'::jsonb,
  'public sample omits transport and preserves unknown location accuracy');
select pg_temp.assert(not has_function_privilege('anon','public.get_telemetry_history_access(uuid,uuid,uuid)','execute')
  and has_function_privilege('service_role','public.get_telemetry_history_access(uuid,uuid,uuid)','execute')
  and not has_function_privilege('authenticated','public.get_telemetry_history_access(uuid,uuid,uuid)','execute')
  and not has_table_privilege('authenticated','private.telemetry_devices','select')
  and not has_table_privilege('authenticated','private.telemetry_outbox','select'),'history minimal privileges');
select pg_temp.assert(to_regprocedure('public.get_telemetry_history_access(uuid)') is null,'old public mapping RPC removed');
set role authenticated;
select pg_temp.expect_sqlstate(format('select public.get_telemetry_history_access(%L,%L,%L)',:'device',:'owner','11111111-1111-4111-8111-111111111110'),'42501');
reset role;
set role service_role;
select set_config('request.jwt.claims',json_build_object('sub',:'owner','session_id','11111111-1111-4111-8111-111111111110')::text,true);
select pg_temp.assert(public.get_telemetry_history_access(:'device',auth.uid(),private.current_session_id()) @>
  '{"enabled":false,"tbDeviceId":null,"pendingCount":0,"failedCount":0,"droppedCount":0,"simulated":true}', 'unmapped is explicit');
select pg_temp.expect_sqlstate(format('select public.get_telemetry_history_access(%L,%L,%L)',:'device',:'owner',:'session'),'42501');
select pg_temp.expect_sqlstate(format('select public.get_telemetry_history_access(%L,%L,null)',:'device',:'owner'),'42501');
reset role;
select public.configure_telemetry_export(:'device',true);
create temp table original_history_identity as select history_id from private.telemetry_devices where device_id=:'device';
update private.telemetry_devices set tb_device_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',dropped_count=4 where device_id=:'device';
insert into private.telemetry_outbox(device_id,authorization_epoch,owner_id,consent_version,session_id,seq,received,state)
  select :'device',robot_authorization_epoch,:'owner',1,:'session',n,'{}',state
  from public.devices cross join (values(1,'pending'),(2,'failed'),(3,'conflict'),(4,'delivered'),(5,'cancelled')) t(n,state)
  where id=:'device';
set role service_role;
select pg_temp.assert((public.get_telemetry_history_access(:'device',auth.uid(),private.current_session_id())->>'historyId')::uuid is not null,
  'new history mapping has an opaque identity');
select pg_temp.assert(public.get_telemetry_history_access(:'device',auth.uid(),private.current_session_id()) @>
  '{"enabled":false,"tbDeviceId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","pendingCount":1,"failedCount":2,"droppedCount":4}',
  'disabled source retains mapped history and delivery statistics');
select set_config('request.jwt.claims',json_build_object('sub',:'other','session_id',:'session')::text,true);
select pg_temp.expect_sqlstate(format('select public.get_telemetry_history_access(%L,auth.uid(),private.current_session_id())',:'device'),'42501');
select pg_temp.expect_sqlstate('select public.get_telemetry_history_access(''eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'',auth.uid(),private.current_session_id())','42501');
reset role;
\echo PASS history_mapping_disabled_retention_statistics_cross_owner_and_privileges

update public.devices set owner_id=:'other' where id=:'device';
set role service_role;
select pg_temp.assert(public.get_telemetry_history_access(:'device',auth.uid(),private.current_session_id()) @>
  '{"enabled":false,"tbDeviceId":null,"pendingCount":0,"failedCount":0,"droppedCount":0}', 'new epoch cannot inherit previous history');
select set_config('request.jwt.claims',json_build_object('sub',:'owner','session_id','11111111-1111-4111-8111-111111111110')::text,true);
select pg_temp.expect_sqlstate(format('select public.get_telemetry_history_access(%L,auth.uid(),private.current_session_id())',:'device'),'42501');
reset role;
select pg_temp.assert((select history_id=(select history_id from original_history_identity) from private.telemetry_devices where device_id=:'device'),
  'ordinary delivery updates preserve history identity');
select public.configure_telemetry_export(:'device',true);
update private.telemetry_devices set tb_device_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where device_id=:'device'
  and owner_id=:'other';
select pg_temp.assert((select history_id<>(select history_id from original_history_identity) from private.telemetry_devices where device_id=:'device' and owner_id=:'other'),
  'new ownership gets a separate history identity');
set role service_role;
select set_config('request.jwt.claims',json_build_object('sub',:'other','session_id',:'session')::text,true);
select pg_temp.assert(public.get_telemetry_history_access(:'device',auth.uid(),private.current_session_id())->>'tbDeviceId'='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','current epoch uses only its own mapping');
reset role;
update public.profiles set account_status='suspended' where id=:'other';
set role service_role;
select pg_temp.expect_sqlstate(format('select public.get_telemetry_history_access(%L,auth.uid(),private.current_session_id())',:'device'),'42501');
reset role;
update public.profiles set account_status='active' where id=:'other';
update public.account_terminals set revoked_at=now() where auth_session_id=:'session';
set role service_role;
select pg_temp.expect_sqlstate(format('select public.get_telemetry_history_access(%L,auth.uid(),private.current_session_id())',:'device'),'42501');
reset role;
update public.account_terminals set revoked_at=null where auth_session_id=:'session';
delete from auth.sessions where id=:'session';
set role service_role;
select pg_temp.expect_sqlstate(format('select public.get_telemetry_history_access(%L,auth.uid(),private.current_session_id())',:'device'),'42501');
reset role;
\echo PASS history_current_epoch_mapping_account_terminal_and_auth_session_guards
rollback;
