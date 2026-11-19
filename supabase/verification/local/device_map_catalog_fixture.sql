\set ON_ERROR_STOP on
-- Synthetic account/session/device dependencies. Loads the production candidate unchanged.
do $$ begin
  if current_database() <> 'doso_map_catalog_fixture' then
    raise exception 'device_map_catalog_fixture_requires_isolated_database';
  end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key references auth.users(id),active boolean not null default true);
create table public.devices(
  id uuid primary key,
  owner_id uuid references auth.users(id),
  is_demo boolean not null default false,
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
create function private.is_session_active() returns boolean
language sql stable set search_path='' as $$ select coalesce(current_setting('request.test_session_active',true),'true')='true'; $$;
grant usage on schema auth,private to authenticated,service_role;
grant execute on function auth.uid(),private.is_account_active(),private.is_session_active() to authenticated;
\ir ../../migrations/20261103120000_add_device_map_catalog.sql

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

insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.profiles select id,true from auth.users;
insert into public.devices(id,owner_id,is_demo) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',false),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',true);
\set owner '11111111-1111-4111-8111-111111111111'
\set other '22222222-2222-4222-8222-222222222222'
\set device 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set metadata '{"name":"Garage","source_map_id":"garage","source_content_epoch":"17","frame_id":"odom","format":"lingtu-map-package-v1","schema_version":1,"archive_format":"tar.gz","size_bytes":662000000,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","crc64":"18446744073709551615"}'

set role service_role;
select public.prepare_map_version(:'owner',:'device','00000000-0000-4000-8000-000000000001',:'metadata')->>'id' as ready_id \gset
select pg_temp.assert(public.prepare_map_version(:'owner',:'device','00000000-0000-4000-8000-000000000001',:'metadata')->>'id'=:'ready_id','idempotent prepare');
select pg_temp.assert(public.get_map_version_for_transfer(:'owner',:'ready_id')->>'object_key'='maps/' || :'owner' || '/' || :'ready_id' || '.tar.gz','server-generated key');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L::jsonb)',:'owner',:'device','00000000-0000-4000-8000-000000000001',jsonb_set(:'metadata'::jsonb,'{name}','"Different"')),'22023');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L)',:'other',:'device','00000000-0000-4000-8000-000000000002',:'metadata'),'42501');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L)',:'owner','cccccccc-cccc-4ccc-8ccc-cccccccccccc','00000000-0000-4000-8000-000000000002',:'metadata'),'42501');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L::jsonb)',:'owner',:'device','00000000-0000-4000-8000-000000000002',:'metadata'::jsonb || '{"object_key":"attacker"}'::jsonb),'22023');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L::jsonb)',:'owner',:'device','00000000-0000-4000-8000-000000000002',jsonb_set(:'metadata'::jsonb,'{size_bytes}','21474836481')),'22023');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L::jsonb)',:'owner',:'device','00000000-0000-4000-8000-000000000002',jsonb_set(:'metadata'::jsonb,'{crc64}','"18446744073709551616"')),'22023');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L::jsonb)',:'owner',:'device','00000000-0000-4000-8000-000000000002',jsonb_set(:'metadata'::jsonb,'{size_bytes}','1.1')),'22023');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L::jsonb)',:'owner',:'device','00000000-0000-4000-8000-000000000002',jsonb_set(:'metadata'::jsonb,'{name}',to_jsonb(E'Garage\nMap'::text))),'22023');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L::jsonb)',:'owner',:'device','00000000-0000-4000-8000-000000000002',jsonb_set(:'metadata'::jsonb,'{source_map_id}',to_jsonb(E'garage\tmap'::text))),'22023');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L::jsonb)',:'owner',:'device','00000000-0000-4000-8000-000000000002',jsonb_set(:'metadata'::jsonb,'{frame_id}',to_jsonb('odom' || chr(127)))),'22023');
select pg_temp.expect_sqlstate(format('select public.begin_map_verification(%L,%L)',:'owner',:'ready_id'),'55000');
select public.set_map_upload_id(:'owner',:'ready_id','fixture-upload');
select public.set_map_upload_id(:'owner',:'ready_id','fixture-upload');
select pg_temp.assert(public.set_map_upload_id(:'owner',:'ready_id','another-upload')->>'upload_id'='fixture-upload','concurrent initialization returns winning upload');
select pg_temp.assert(public.get_map_version_for_transfer(:'owner',:'ready_id')->>'upload_id'='fixture-upload','losing upload never persisted');
select public.begin_map_verification(:'owner',:'ready_id');
select public.finish_map_verification(:'owner',:'ready_id',662000000,'18446744073709551615');
select public.finish_map_verification(:'owner',:'ready_id',662000000,'18446744073709551615');
select pg_temp.expect_sqlstate(format('select public.finish_map_verification(%L,%L,662000001,%L)',:'owner',:'ready_id','18446744073709551615'),'55000');
select pg_temp.expect_sqlstate(format('select public.finish_map_verification(%L,%L,662000000,%L)',:'owner',:'ready_id','42'),'55000');
select pg_temp.assert(public.get_map_version_for_transfer(:'owner',:'ready_id')->>'status'='ready','matched object ready');
select pg_temp.expect_sqlstate(format('select public.set_map_upload_id(%L,%L,%L)',:'owner',:'ready_id','fixture-upload'),'55000');
select pg_temp.expect_sqlstate(format('select public.cancel_map_version(%L,%L)',:'owner',:'ready_id'),'55000');
select pg_temp.expect_sqlstate(format('update public.device_map_versions set name=%L where id=%L','Overwrite',:'ready_id'),'42501');
select public.prepare_map_version(:'owner',:'device','00000000-0000-4000-8000-000000000010',:'metadata')->>'id' as size_failure_id \gset
select public.set_map_upload_id(:'owner',:'size_failure_id','size-failure-upload');
select public.begin_map_verification(:'owner',:'size_failure_id');
select pg_temp.assert(public.finish_map_verification(:'owner',:'size_failure_id',662000001,'18446744073709551615')->>'status'='failed','size mismatch commits failed state');
select pg_temp.assert(public.get_map_version_for_transfer(:'owner',:'size_failure_id')->>'status'='failed','failure remains readable');
select pg_temp.expect_sqlstate(format('select public.begin_map_verification(%L,%L)',:'owner',:'size_failure_id'),'55000');
select pg_temp.expect_sqlstate(format('select public.set_map_upload_id(%L,%L,%L)',:'owner',:'size_failure_id','size-failure-upload'),'55000');
select pg_temp.expect_sqlstate(format('select public.finish_map_verification(%L,%L,662000000,%L)',:'owner',:'size_failure_id','18446744073709551615'),'55000');
select public.prepare_map_version(:'owner',:'device','00000000-0000-4000-8000-000000000011',:'metadata')->>'id' as crc_failure_id \gset
select public.set_map_upload_id(:'owner',:'crc_failure_id','crc-failure-upload');
select public.begin_map_verification(:'owner',:'crc_failure_id');
select pg_temp.assert(public.finish_map_verification(:'owner',:'crc_failure_id',662000000,'42')->>'status'='failed','CRC mismatch commits failed state');
\echo PASS metadata_and_ready_lifecycle

select public.prepare_map_version(:'owner',:'device','00000000-0000-4000-8000-000000000002',:'metadata')->>'id' as cancel_id \gset
select public.set_map_upload_id(:'owner',:'cancel_id','cancel-upload');
select public.begin_map_verification(:'owner',:'cancel_id');
select public.cancel_map_version(:'owner',:'cancel_id');
select public.cancel_map_version(:'owner',:'cancel_id');
select pg_temp.expect_sqlstate(format('select public.finish_map_verification(%L,%L,662000000,%L)',:'owner',:'cancel_id','18446744073709551615'),'55000');
select pg_temp.assert(public.get_map_version_for_transfer(:'owner',:'cancel_id')->>'status'='cancelled','late completion cannot resurrect');
select pg_temp.expect_sqlstate(format('select public.get_map_version_for_transfer(%L,%L,false)',:'other',:'ready_id'),'42501');
\echo PASS cancelled_and_cross_owner

reset role;
set role authenticated;
select set_config('request.user_id',:'owner',false);
select pg_temp.assert((select count(*)=4 from public.device_map_versions),'owner reads own catalog');
select pg_temp.expect_sqlstate(format('select public.prepare_map_version(%L,%L,%L,%L)',:'owner',:'device','00000000-0000-4000-8000-000000000003',:'metadata'),'42501');
select pg_temp.expect_sqlstate(format('update public.device_map_versions set status=%L where id=%L','ready',:'cancel_id'),'42501');
select pg_temp.expect_sqlstate('select * from private.device_map_uploads','42501');
select set_config('request.user_id',:'other',false);
select pg_temp.assert((select count(*)=0 from public.device_map_versions),'other account sees no catalog');
select set_config('request.user_id',:'owner',false);
select set_config('request.test_session_active','false',false);
select pg_temp.assert((select count(*)=0 from public.device_map_versions),'revoked session sees no catalog');
select set_config('request.test_session_active','true',false);
reset role;
set role anon;
select pg_temp.expect_sqlstate('select * from public.device_map_versions','42501');
select pg_temp.expect_sqlstate(format('select public.get_map_version_for_transfer(%L,%L,false)',:'owner',:'ready_id'),'42501');
reset role;
\echo PASS rls_and_privileges

set role service_role;
select public.prepare_map_version(:'owner',:'device','00000000-0000-4000-8000-000000000003',:'metadata')->>'id' as stale_id \gset
select public.set_map_upload_id(:'owner',:'stale_id','stale-upload');
select public.begin_map_verification(:'owner',:'stale_id');
reset role;
update public.devices set robot_authorization_epoch=2 where id=:'device';
set role service_role;
select pg_temp.expect_sqlstate(format('select public.finish_map_verification(%L,%L,662000000,%L)',:'owner',:'stale_id','18446744073709551615'),'55000');
select pg_temp.expect_sqlstate(format('select public.get_map_version_for_transfer(%L,%L)',:'owner',:'stale_id'),'55000');
select pg_temp.assert(public.get_map_version_for_transfer(:'owner',:'ready_id',false)->>'status'='ready','ready map remains old owner property');
reset role;
update public.devices set owner_id=null,robot_authorization_epoch=3 where id=:'device';
update public.devices set owner_id=null where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.devices set owner_id=:'other',robot_authorization_epoch=4 where id=:'device';
set role service_role;
select pg_temp.expect_sqlstate(format('select public.get_map_version_for_transfer(%L,%L)',:'owner',:'ready_id'),'55000');
select pg_temp.expect_sqlstate(format('select public.get_map_version_for_transfer(%L,%L,false)',:'other',:'ready_id'),'42501');
select pg_temp.assert(public.get_map_version_for_transfer(:'owner',:'ready_id',false)->>'owner_id'=:'owner','sale preserves creating owner');
select pg_temp.expect_sqlstate(format('select public.cancel_map_version(%L,%L)',:'other',:'stale_id'),'42501');
select pg_temp.assert(public.cancel_map_version(:'owner',:'stale_id')->>'status'='cancelled','creating owner cancels unfinished upload after sale');
reset role;
update public.profiles set active=false where id=:'owner';
set role authenticated;
select set_config('request.user_id',:'owner',false);
select pg_temp.assert((select count(*)=0 from public.device_map_versions),'inactive account cannot list');
reset role;
set role service_role;
select pg_temp.expect_sqlstate(format('select public.get_map_version_for_transfer(%L,%L,false)',:'owner',:'ready_id'),'42501');
reset role;
\echo PASS source_epoch_sale_and_account

-- Leave a verifying version for the runner's independent-backend cancel/finish race.
update public.profiles set active=true where id=:'owner';
update public.devices set owner_id=:'owner',robot_authorization_epoch=5 where id=:'device';
set role service_role;
select public.prepare_map_version(:'owner',:'device','00000000-0000-4000-8000-000000000004',:'metadata')->>'id' as race_id \gset
select public.set_map_upload_id(:'owner',:'race_id','race-upload');
select public.begin_map_verification(:'owner',:'race_id');
select 'RACE_VERSION=' || :'race_id';
