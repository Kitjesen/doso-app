\set ON_ERROR_STOP on
-- Runs against the production migrations loaded by multi_device_ownership.sql.
select pg_temp.assert((select count(*)=1 from pg_catalog.pg_trigger
  where tgrelid='public.devices'::regclass and not tgisinternal and tgenabled in ('O','A')
    and tgfoid in (to_regprocedure('private.enforce_device_authorization_epoch()'),
      to_regprocedure('private.enforce_robot_device_update()'))),'one epoch authority');
select pg_temp.assert(not exists(select 1 from pg_catalog.pg_proc
  where oid=to_regprocedure('private.enforce_device_authorization_epoch()') and prosecdef),'minimal trigger is invoker');
select pg_temp.assert(not exists(select 1 from pg_catalog.pg_proc
  where oid=to_regprocedure('private.enforce_device_authorization_epoch()')
    and (has_function_privilege('anon',oid,'execute')
      or has_function_privilege('authenticated',oid,'execute')
      or has_function_privilege('service_role',oid,'execute'))),'minimal trigger execute revoked');
begin;
-- Give the direct-write probes enough SQL privileges to reach the trigger boundary.
grant update(owner_id,robot_authorization_epoch) on public.devices to authenticated,service_role;
set role authenticated;
select pg_temp.expect_sqlstate($sql$update public.devices set robot_authorization_epoch=robot_authorization_epoch+1
  where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$sql$,'42501');
reset role;
set role service_role;
select pg_temp.expect_sqlstate($sql$update public.devices set robot_authorization_epoch=robot_authorization_epoch+1
  where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$sql$,'42501');
select pg_temp.expect_sqlstate($sql$update public.devices set owner_id=null
  where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$sql$,'42501');
reset role;
select pg_temp.expect_sqlstate('update public.devices set robot_authorization_epoch=robot_authorization_epoch-1'
  || case when to_regprocedure('private.enforce_robot_device_update()') is null then ''
     else ',robot_authority_version=robot_authority_version+1' end
  || ' where id=''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb''','P0001');
do $$
declare v_epoch bigint;
begin
  select robot_authorization_epoch into v_epoch from public.devices
    where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  update public.devices set owner_id='22222222-2222-4222-8222-222222222222',robot_authorization_epoch=999
    where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  perform pg_temp.assert((select robot_authorization_epoch=v_epoch+1 from public.devices
    where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'owner transfer advances exactly once');
  perform pg_temp.assert((select robot_authorization_epoch=3 and owner_id is null from public.devices
    where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'transfer preserves other device');
end;
$$;
rollback;
\echo PASS epoch_single_authority_permissions_rollback_and_transfer
