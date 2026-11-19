-- Run after the full multi-device fixture in its isolated database.
begin;
\ir ../../migrations/20261105110000_add_video_grants.sql
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
\set session '11111111-1111-4111-8111-111111111110'
\set device '99999999-9999-4999-8999-999999999991'
insert into public.devices(id,owner_id,serial_number,model_code,display_name,category,environment,robot_lifecycle)
values(:'device',:'owner','LOCAL-VIDEO-1','thunder','Local video','quadruped','local','owned');
set role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',:'owner','session_id',:'session')::text,false);
select pg_temp.assert(public.open_video_access(:'device',repeat('a',64)) @> jsonb_build_object('viewerId',:'owner','deviceId',:'device'),'owner opens');
select pg_temp.expect_sqlstate('select public.authorize_video_access(repeat(''a'',64))','42501');
select pg_temp.expect_sqlstate('select * from private.video_grants','42501');
reset role;
set role service_role;
select pg_temp.assert(public.authorize_video_access(repeat('a',64)) @> jsonb_build_object('viewerId',:'owner','deviceId',:'device'),'valid grant');
reset role;
select pg_temp.assert((select expires_at<=clock_timestamp()+interval '60 seconds' and token_digest=repeat('a',64) from private.video_grants where device_id=:'device'),'bounded expiry and digest');
\echo PASS video_owner_digest_and_privilege_boundary

set role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',:'other','session_id',:'session')::text,false);
select pg_temp.expect_sqlstate(format('select public.open_video_access(%L,repeat(''b'',64))',:'device'),'42501');
select set_config('request.jwt.claims',json_build_object('sub',:'owner','session_id',:'session')::text,false);
select public.open_video_access(:'device',repeat('b',64));
reset role;
set role service_role;
select pg_temp.assert(public.authorize_video_access(repeat('a',64)) is null,'replacement revokes old token');
select pg_temp.assert(public.authorize_video_access(repeat('b',64)) is not null,'replacement valid');
reset role;
\echo PASS video_cross_owner_and_replacement

update public.account_terminals set revoked_at=now() where auth_session_id=:'session';
select pg_temp.assert(public.authorize_video_access(repeat('b',64)) is null,'terminal revoked');
update public.account_terminals set revoked_at=null where auth_session_id=:'session';
update public.profiles set account_status='suspended' where id=:'owner';
select pg_temp.assert(public.authorize_video_access(repeat('b',64)) is null,'account suspended');
update public.profiles set account_status='active' where id=:'owner';
update private.video_grants set expires_at=now()-interval '1 second' where device_id=:'device';
select pg_temp.assert(public.authorize_video_access(repeat('b',64)) is null,'expired');
\echo PASS video_expiry_account_and_terminal_revocation

set role authenticated;
select public.open_video_access(:'device',repeat('c',64));
select public.close_video_access(:'device');
reset role;
select pg_temp.assert(public.authorize_video_access(repeat('c',64)) is null,'explicit close');
set role authenticated;
select public.open_video_access(:'device',repeat('d',64));
reset role;
update public.devices set owner_id=null where id=:'device';
select pg_temp.assert(public.authorize_video_access(repeat('d',64)) is null,'unbind invalidates grant');
update public.devices set owner_id=:'owner' where id=:'device';
select pg_temp.assert(public.authorize_video_access(repeat('d',64)) is null,'rebind cannot restore old epoch');
update public.devices set robot_lifecycle='quarantined',robot_authorization_epoch=robot_authorization_epoch+1,
  robot_authority_version=robot_authority_version+1 where id=:'device';
set role authenticated;
select pg_temp.expect_sqlstate(format('select public.open_video_access(%L,repeat(''e'',64))',:'device'),'42501');
reset role;
update public.devices set robot_lifecycle='owned',robot_authorization_epoch=robot_authorization_epoch+1,
  robot_authority_version=robot_authority_version+1 where id=:'device';
\echo PASS video_close_and_ownership_epoch_revocation

set role authenticated;
select public.open_video_access(:'device',repeat('e',64));
reset role;
delete from auth.sessions where id=:'session';
select pg_temp.assert(public.authorize_video_access(repeat('e',64)) is null,'Auth session deleted');
\echo PASS video_auth_session_revocation

-- The deployed status-only schema has no command lifecycle column.
insert into auth.sessions values(:'session',:'owner');
alter table public.devices drop column robot_lifecycle cascade;
set role authenticated;
select pg_temp.assert(public.open_video_access(:'device',repeat('f',64)) is not null,'minimal schema can issue');
reset role;
select pg_temp.assert(public.authorize_video_access(repeat('f',64)) is not null,'minimal schema can authorize');
\echo PASS video_status_only_schema_compatibility
rollback;
