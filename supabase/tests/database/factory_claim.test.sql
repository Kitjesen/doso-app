-- Run after supabase/verification/local/multi_device_ownership.sql in its isolated database.
\ir ../../migrations/20261104100000_create_device_inventory.sql
\ir ../../migrations/20261104110000_issue_factory_claim.sql
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
update public.profiles set app_role='admin' where id='11111111-1111-4111-8111-111111111111';
insert into public.devices(id,serial_number,model_code,display_name,category,environment,is_demo)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','LOCAL-FACTORY','Thunder','Factory','四足','室外',false),
('ffffffff-ffff-4fff-8fff-ffffffffffff',null,'Thunder','Demo','四足','室外',true);
set role service_role;
select pg_temp.assert(public.admin_issue_factory_claim('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',repeat('a',64),now()+interval '2 years','factory test','factory-1'),'factory claim issued');
reset role;
select pg_temp.assert((select code_digest=repeat('a',64) and expires_at>now()+interval '1 year' and consumed_at is null from private.device_claims where device_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),'long inventory expiry preserved');
select pg_temp.assert((select count(*)=1 from public.audit_logs where resource_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and metadata->>'requestId'='factory-1' and not metadata::text like '%'||repeat('a',64)||'%'),'issuance audited without digest');
select pg_temp.assert(not has_function_privilege('authenticated','public.admin_issue_factory_claim(uuid,uuid,text,timestamptz,text,text)','execute') and not has_function_privilege('anon','public.admin_issue_factory_claim(uuid,uuid,text,timestamptz,text,text)','execute'),'factory RPC service-only');
\echo PASS factory_digest_expiry_audit_permissions
set role service_role;
select pg_temp.expect_sqlstate($sql$select public.admin_issue_factory_claim('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',repeat('b',64),now()+interval '2 years','test','factory-2')$sql$,'42501');
select pg_temp.expect_sqlstate($sql$select public.admin_issue_factory_claim('11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff',repeat('b',64),now()+interval '2 years','test','factory-2')$sql$,'P0001');
select pg_temp.expect_sqlstate($sql$select public.admin_issue_factory_claim('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',repeat('b',64),now()+interval '2 years','test','factory-2')$sql$,'P0001');
select pg_temp.assert(not public.admin_issue_factory_claim('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000000',repeat('b',64),now()+interval '2 years','test','factory-2'),'missing inventory rejected');
select pg_temp.expect_sqlstate($sql$select public.admin_issue_factory_claim('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',repeat('b',64),now()-interval '1 second','test','factory-2')$sql$,'22023');
reset role;
select pg_temp.assert((select code_digest=repeat('a',64) from private.device_claims where device_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),'failed issuance preserves old credential');
\echo PASS factory_admin_inventory_and_expiry_guards
set role service_role;
select public.admin_issue_factory_claim('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',repeat('b',64),now()+interval '2 years','replacement','factory-3');
select pg_temp.assert((public.claim_device_with_digest('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,repeat('a',64))).id is null,'old printed credential invalidated');
select pg_temp.assert((public.claim_device_with_digest('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,repeat('b',64))).owner_id='22222222-2222-4222-8222-222222222222','replacement claimed through UUID transaction');
select pg_temp.expect_sqlstate($sql$select public.admin_issue_factory_claim('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',repeat('c',64),now()+interval '2 years','test','factory-4')$sql$,'P0001');
select pg_temp.assert((public.claim_device_with_digest('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,repeat('b',64))).id is null,'successful credential consumed once');
reset role;
\echo PASS factory_reissue_and_single_use_claim
