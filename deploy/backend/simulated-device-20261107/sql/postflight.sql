\set ON_ERROR_STOP on
do $$ declare signature text; target regprocedure; begin
  if current_database()<>'postgres' or current_user<>'postgres'
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='devices' and column_name='is_simulated' and data_type='boolean' and is_nullable='NO')
     or not exists(select 1 from pg_trigger where tgrelid='public.devices'::regclass and tgname='device_simulation_identity' and tgenabled='O') then
    raise exception 'simulated_device_identity_missing';
  end if;
  foreach signature in array array['public.create_device_inventory(uuid,text,text,text,text,text,text,text)', 'public.create_device_inventory(uuid,text,text,text,text,text,text,text,boolean)'] loop
    target:=to_regprocedure(signature);
    if target is null or not has_function_privilege('service_role',target,'execute')
       or has_function_privilege('anon',target,'execute') or has_function_privilege('authenticated',target,'execute') then
      raise exception 'simulated_device_inventory_privilege_changed';
    end if;
  end loop;
  if has_column_privilege('authenticated','public.devices','is_simulated','update')
     or position('is_simulated' in pg_get_functiondef('private.remote_state_dto(private.device_remote_state)'::regprocedure))=0 then
    raise exception 'simulated_device_dto_or_privilege_invalid';
  end if;
end $$;
\echo PASS simulated_device_readonly_postflight
