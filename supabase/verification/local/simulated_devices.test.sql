-- Runs against the isolated multi-device fixture, preserving its records.
begin;
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

\ir ../../migrations/20261104100000_create_device_inventory.sql
\ir ../../migrations/20261107100000_add_simulated_devices.sql
update public.profiles set app_role='admin' where id='22222222-2222-4222-8222-222222222222';
set role service_role;
select pg_temp.assert(not has_function_privilege('authenticated','public.create_device_inventory(uuid,text,text,text,text,text,text,text,boolean)','execute'),'simulation inventory stays service-only');
select (public.create_device_inventory('22222222-2222-4222-8222-222222222222','DOSO-SIM-LOCAL','Thunder','模拟设备','四足','室内','verification','sim-inventory',true)).id;
select (public.create_device_inventory('22222222-2222-4222-8222-222222222222','DOSO-REAL-LOCAL','Thunder','Real','四足','室内','verification','real-inventory')).id;
select pg_temp.assert((select is_simulated and not is_demo and owner_id is null from public.devices where serial_number='DOSO-SIM-LOCAL'),'simulation is real inventory with explicit identity');
select pg_temp.assert((select not is_simulated from public.devices where serial_number='DOSO-REAL-LOCAL'),'legacy eight-argument RPC defaults to physical');
select public.rotate_device_claim((select id from public.devices where serial_number='DOSO-SIM-LOCAL'),repeat('f',64),now()+interval '10 minutes');
select pg_temp.assert((public.claim_device_with_digest('11111111-1111-4111-8111-111111111111',(select id from public.devices where serial_number='DOSO-SIM-LOCAL'),repeat('f',64))).owner_id='11111111-1111-4111-8111-111111111111','normal binding owns simulated inventory');
select pg_temp.expect_sqlstate($sql$update public.devices set is_simulated=false where serial_number='DOSO-SIM-LOCAL'$sql$,'23514');
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"11111111-1111-4111-8111-111111111110"}',true);
select pg_temp.assert((public.get_remote_state((select id from public.devices where serial_number='DOSO-SIM-LOCAL'))->>'simulated')::boolean,'normal owner state DTO identifies simulation');
select pg_temp.assert((public.set_remote_state((select id from public.devices where serial_number='DOSO-SIM-LOCAL'),true,1))->>'enabled'='true','normal account enables simulated reporting');
select pg_temp.expect_sqlstate($sql$update public.devices set is_simulated=false where serial_number='DOSO-SIM-LOCAL'$sql$,'42501');
select pg_temp.expect_sqlstate($sql$insert into public.devices(owner_id,model_code,display_name,category,environment,is_demo,is_simulated) values('11111111-1111-4111-8111-111111111111','Thunder','forged','四足','室内',true,true)$sql$,'23514');
reset role;
rollback;
\echo PASS simulated_inventory_normal_binding_identity_and_state
