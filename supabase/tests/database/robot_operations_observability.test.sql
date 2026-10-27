begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

select has_function(
  'public',
  'get_robot_operations_observability',
  array['integer','integer'],
  'robot operations observability RPC exists with the fixed signature'
);
select ok((
  select p.prosecdef
    and p.provolatile = 's'
    and p.proconfig @> array['search_path=""']::text[]
    and pg_get_function_result(p.oid) = 'jsonb'
  from pg_proc p
  where p.oid = 'public.get_robot_operations_observability(integer,integer)'::regprocedure
), 'RPC is stable security-definer JSONB with an empty search_path');
select ok(
  has_function_privilege('service_role','public.get_robot_operations_observability(integer,integer)','EXECUTE')
  and not has_function_privilege('anon','public.get_robot_operations_observability(integer,integer)','EXECUTE')
  and not has_function_privilege('authenticated','public.get_robot_operations_observability(integer,integer)','EXECUTE'),
  'only service_role can execute the aggregate RPC'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
    ]) as privileges(privilege_name)
    where has_table_privilege(
      'service_role',
      'private.device_command_outbox',
      privilege_name
    )
       or has_table_privilege(
         'service_role',
         'private.device_command_ack_events',
         privilege_name
       )
  )
  and not exists (
    select 1
    from unnest(array['USAGE','SELECT','UPDATE']) as privileges(privilege_name)
    where has_sequence_privilege(
      'service_role',
      'private.device_command_ack_events_id_seq',
      privilege_name
    )
  ),
  'service_role receives no table or sequence privilege on private robot persistence'
);
select throws_ok(
  $$select public.get_robot_operations_observability(null,120)$$,
  '22023',
  'invalid robot operations observability bounds',
  'NULL window is rejected'
);
select throws_ok(
  $$select public.get_robot_operations_observability(3600,null)$$,
  '22023',
  'invalid robot operations observability bounds',
  'NULL shadow staleness is rejected'
);
select throws_ok(
  $$select public.get_robot_operations_observability(59,120)$$,
  '22023',
  'invalid robot operations observability bounds',
  'window below 60 seconds is rejected'
);
select throws_ok(
  $$select public.get_robot_operations_observability(604801,120)$$,
  '22023',
  'invalid robot operations observability bounds',
  'window above seven days is rejected'
);
select throws_ok(
  $$select public.get_robot_operations_observability(3600,59)$$,
  '22023',
  'invalid robot operations observability bounds',
  'shadow threshold below 60 seconds is rejected'
);
select throws_ok(
  $$select public.get_robot_operations_observability(3600,86401)$$,
  '22023',
  'invalid robot operations observability bounds',
  'shadow threshold above one day is rejected'
);
select lives_ok(
  $$select public.get_robot_operations_observability(60,60)$$,
  'minimum parameter bounds are accepted'
);
select lives_ok(
  $$select public.get_robot_operations_observability(604800,86400)$$,
  'maximum parameter bounds are accepted'
);

truncate table
  private.device_command_ack_events,
  private.device_command_outbox,
  public.device_commands
restart identity;

create temporary table g016_empty_snapshot as
select public.get_robot_operations_observability(3600,120) as result;
select is(
  (select result #> '{commands,queued,oldest_age_seconds}' from g016_empty_snapshot),
  'null'::jsonb,
  'empty queue reports a JSON null oldest age'
);
select ok((
  select array(
    select key from jsonb_object_keys(result) as keys(key) order by key
  ) = array[
    'ack_rejections','commands','contract_version','sampled_at',
    'shadow_stale_after_seconds','trusted_shadows','window'
  ]
  from g016_empty_snapshot
), 'the empty result has the exact fixed top-level key set');

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) select
  ('a1600000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','g016-owner-' || n || '@doso.test',
  crypt('StrongPass123',gen_salt('bf')),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username','g016_owner_' || n),
  transaction_timestamp(),transaction_timestamp()
from generate_series(1,7) as n;

insert into public.account_terminals(
  id,user_id,auth_session_id,installation_id,platform,device_label
) values (
  'a1610000-0000-4000-8000-000000000001',
  'a1600000-0000-4000-8000-000000000001',
  'a1610000-0000-4000-8000-000000000002',
  'g016-observability','linux','G016 fixture terminal'
);

insert into public.devices(
  id,owner_id,model_code,display_name,category,environment,serial_number,is_demo,
  robot_lifecycle,robot_public_key_pem,robot_public_key_fingerprint,robot_active_boot_id,
  trusted_telemetry_captured_at,trusted_telemetry_received_at
) values
('a1620000-0000-4000-8000-000000000001','a1600000-0000-4000-8000-000000000001','thunder','G016 fresh','四足','室内','G016-001',false,
 'owned',repeat('K',64),repeat('1',64),'boot-g016-fresh',transaction_timestamp()-interval '61 seconds',transaction_timestamp()-interval '119 seconds'),
('a1620000-0000-4000-8000-000000000002','a1600000-0000-4000-8000-000000000002','thunder','G016 stale boundary','四足','室内','G016-002',false,
 'owned',repeat('K',64),repeat('2',64),'boot-g016-stale',transaction_timestamp()-interval '121 seconds',transaction_timestamp()-interval '120 seconds'),
('a1620000-0000-4000-8000-000000000003','a1600000-0000-4000-8000-000000000003','thunder','G016 missing received','四足','室内','G016-003',false,
 'owned',repeat('K',64),repeat('3',64),'boot-g016-missing-1',transaction_timestamp()-interval '30 seconds',null),
('a1620000-0000-4000-8000-000000000004','a1600000-0000-4000-8000-000000000004','thunder','G016 missing captured','四足','室内','G016-004',false,
 'owned',repeat('K',64),repeat('4',64),'boot-g016-missing-2',null,transaction_timestamp()-interval '30 seconds'),
('a1620000-0000-4000-8000-000000000005','a1600000-0000-4000-8000-000000000005','thunder','G016 demo excluded','四足','室内',null,true,
 'owned',repeat('K',64),repeat('5',64),'boot-g016-demo',transaction_timestamp(),transaction_timestamp()),
('a1620000-0000-4000-8000-000000000006','a1600000-0000-4000-8000-000000000006','thunder','G016 quarantined excluded','四足','室内','G016-006',false,
 'quarantined',repeat('K',64),repeat('6',64),'boot-g016-quarantine',transaction_timestamp(),transaction_timestamp()),
('a1620000-0000-4000-8000-000000000007','a1600000-0000-4000-8000-000000000007','thunder','G016 keyless excluded','四足','室内','G016-007',false,
 'owned',null,null,null,transaction_timestamp(),transaction_timestamp());

insert into public.device_commands(
  id,device_id,owner_id,terminal_id,actor_user_id,auth_session_id,
  authorization_epoch,expected_boot_id,expected_device_version,expected_public_key_fingerprint,
  idempotency_key,request_digest,include_fields,issued_at,expires_at,delivery_status,created_at,updated_at
)
select
  ('a1630000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'a1620000-0000-4000-8000-000000000001'::uuid,
  'a1600000-0000-4000-8000-000000000001'::uuid,
  'a1610000-0000-4000-8000-000000000001'::uuid,
  'a1600000-0000-4000-8000-000000000001'::uuid,
  'a1610000-0000-4000-8000-000000000002'::uuid,
  1,'boot-g016-fresh',1,repeat('1',64),
  'g016-' || n,md5('g016-' || n) || md5('digest-' || n),array['battery'],
  transaction_timestamp()-interval '10 seconds',transaction_timestamp()+interval '1 hour',
  case n
    when 1 then 'queued' when 2 then 'queued' when 3 then 'leased'
    when 4 then 'dispatching' when 5 then 'published' when 6 then 'published'
    when 7 then 'delivery_unknown' when 8 then 'dead_letter' else 'revocation_pending'
  end,
  case n
    when 1 then transaction_timestamp()-interval '3600 seconds'
    when 2 then transaction_timestamp()-interval '3601 seconds'
    else transaction_timestamp()-interval '10 seconds'
  end,
  transaction_timestamp()
from generate_series(1,9) as n;

insert into private.device_command_outbox(
  command_id,status,attempts,lease_token,fencing_token,leased_until,
  transport_message_id,published_at,ack_deadline,updated_at
)
select
  c.id,c.delivery_status,
  case when c.delivery_status in ('leased','dispatching','published') then 1 else 0 end,
  case when c.delivery_status in ('leased','dispatching') then gen_random_uuid() else null end,
  case when c.delivery_status in ('leased','dispatching') then 1 else 0 end,
  case c.delivery_status
    when 'leased' then transaction_timestamp()
    when 'dispatching' then transaction_timestamp()+interval '1 second'
    else null
  end,
  case when c.delivery_status='published' then 'g016-transport-' || c.id else null end,
  case when c.delivery_status='published' then transaction_timestamp()-interval '1 second' else null end,
  case c.id
    when 'a1630000-0000-4000-8000-000000000005'::uuid then transaction_timestamp()
    when 'a1630000-0000-4000-8000-000000000006'::uuid then transaction_timestamp()+interval '1 second'
    else null
  end,
  transaction_timestamp()
from public.device_commands c
where c.id::text like 'a1630000-0000-4000-8000-%';

insert into private.device_command_ack_events(
  device_id,command_id,frame_digest,authorization_epoch,idempotency_key,boot_id,status,
  occurred_at,received_at,reason,signature_b64url,applied,projection_reason
)
select
  'a1620000-0000-4000-8000-000000000001'::uuid,
  'fixture-' || ordinal,
  lpad(to_hex(ordinal),64,'0'),
  1,'g016-ack-' || ordinal,'boot-g016-fresh','rejected',
  transaction_timestamp(),case when ordinal=1 then transaction_timestamp() else transaction_timestamp()-interval '1 second' end,
  jsonb_build_object('private_payload','must-not-leak-' || ordinal),
  repeat('s',16),false,reason
from (values
  (1,'unknown_command'),
  (2,'device_not_owned'),
  (3,'unsupported_command_projection'),
  (4,'device_binding_mismatch'),
  (5,'authorization_epoch_mismatch'),
  (6,'boot_mismatch'),
  (7,'clock_unavailable'),
  (8,'clock_skew'),
  (9,'frame_expired'),
  (10,'command_expired'),
  (11,'illegal_ack_transition'),
  (12,'projection_conflict'),
  (13,'future_contract_reason')
) as reasons(ordinal,reason);

insert into private.device_command_ack_events(
  device_id,command_id,frame_digest,authorization_epoch,idempotency_key,boot_id,status,
  occurred_at,received_at,reason,signature_b64url,applied,projection_reason
) values
('a1620000-0000-4000-8000-000000000001','outside-before',repeat('e',64),1,'outside-before','boot-g016-fresh','rejected',
 transaction_timestamp(),transaction_timestamp()-interval '3601 seconds','{"secret":"outside"}',repeat('s',16),false,'unknown_command'),
('a1620000-0000-4000-8000-000000000001','applied',repeat('f',64),1,'applied','boot-g016-fresh','succeeded',
 transaction_timestamp(),transaction_timestamp(),'{"secret":"applied"}',repeat('s',16),true,'applied');

create temporary table g016_before_read as
select
  (select count(*) from public.device_commands) as command_count,
  (select count(*) from private.device_command_outbox) as outbox_count,
  (select count(*) from private.device_command_ack_events) as ack_count,
  (select max(updated_at) from private.device_command_outbox) as outbox_updated_at;

set local role service_role;
create temporary table g016_snapshot as
select public.get_robot_operations_observability(3600,120) as result;
reset role;

select ok((
  select (result->>'contract_version')::integer = 1
    and (result->>'sampled_at')::timestamptz = transaction_timestamp()
    and (result #>> '{window,seconds}')::integer = 3600
    and (result #>> '{window,started_at}')::timestamptz = transaction_timestamp()-interval '3600 seconds'
    and (result->>'shadow_stale_after_seconds')::integer = 120
  from g016_snapshot
), 'sample time, window and contract metadata use one transaction timestamp');
select ok((
  select
    array(select key from jsonb_object_keys(result) as keys(key) order by key) = array[
      'ack_rejections','commands','contract_version','sampled_at',
      'shadow_stale_after_seconds','trusted_shadows','window'
    ]
    and array(select key from jsonb_object_keys(result->'window') as keys(key) order by key) =
      array['seconds','started_at']
    and array(select key from jsonb_object_keys(result->'commands') as keys(key) order by key) =
      array['attention','in_flight','queued']
    and array(select key from jsonb_object_keys(result#>'{commands,queued}') as keys(key) order by key) =
      array['created_in_window_count','current_count','older_than_window_count','oldest_age_seconds']
    and array(select key from jsonb_object_keys(result#>'{commands,in_flight}') as keys(key) order by key) =
      array[
        'dispatching_count','dispatching_overdue_count','leased_count','leased_overdue_count',
        'published_count','published_overdue_count'
      ]
    and array(select key from jsonb_object_keys(result#>'{commands,attention}') as keys(key) order by key) =
      array['dead_letter_count','delivery_unknown_count','revocation_pending_count']
    and array(select key from jsonb_object_keys(result->'ack_rejections') as keys(key) order by key) =
      array['by_reason','event_attempt_count']
    and array(select key from jsonb_object_keys(result#>'{ack_rejections,by_reason}') as keys(key) order by key) =
      array[
        'authorization_epoch_mismatch','boot_mismatch','clock_skew','clock_unavailable',
        'command_expired','device_binding_mismatch','device_not_owned','frame_expired',
        'illegal_ack_transition','other','projection_conflict','unknown_command',
        'unsupported_command_projection'
      ]
    and array(select key from jsonb_object_keys(result->'trusted_shadows') as keys(key) order by key) =
      array['eligible_device_count','fresh_count','missing_count','stale_count']
  from g016_snapshot
), 'every observability object has its exact fixed key set');
select ok((
  select
    jsonb_typeof(result) = 'object'
    and jsonb_typeof(result->'contract_version') = 'number'
    and jsonb_typeof(result->'sampled_at') = 'string'
    and jsonb_typeof(result->'window') = 'object'
    and jsonb_typeof(result#>'{window,seconds}') = 'number'
    and jsonb_typeof(result#>'{window,started_at}') = 'string'
    and jsonb_typeof(result->'shadow_stale_after_seconds') = 'number'
    and jsonb_typeof(result->'commands') = 'object'
    and jsonb_typeof(result#>'{commands,queued}') = 'object'
    and jsonb_typeof(result#>'{commands,in_flight}') = 'object'
    and jsonb_typeof(result#>'{commands,attention}') = 'object'
    and jsonb_typeof(result->'ack_rejections') = 'object'
    and jsonb_typeof(result#>'{ack_rejections,by_reason}') = 'object'
    and jsonb_typeof(result->'trusted_shadows') = 'object'
    and not exists (
      select 1
      from jsonb_each(result#>'{commands,queued}') as item(key,value)
      where key <> 'oldest_age_seconds' and jsonb_typeof(value) <> 'number'
    )
    and jsonb_typeof(result#>'{commands,queued,oldest_age_seconds}') in ('number','null')
    and not exists (
      select 1
      from jsonb_each(result#>'{commands,in_flight}') as item(key,value)
      where jsonb_typeof(value) <> 'number'
    )
    and not exists (
      select 1
      from jsonb_each(result#>'{commands,attention}') as item(key,value)
      where jsonb_typeof(value) <> 'number'
    )
    and jsonb_typeof(result#>'{ack_rejections,event_attempt_count}') = 'number'
    and not exists (
      select 1
      from jsonb_each(result#>'{ack_rejections,by_reason}') as item(key,value)
      where jsonb_typeof(value) <> 'number'
    )
    and not exists (
      select 1
      from jsonb_each(result->'trusted_shadows') as item(key,value)
      where jsonb_typeof(value) <> 'number'
    )
  from g016_snapshot
), 'timestamps are strings, containers are objects, and all counters, seconds, and versions are JSON numbers');
select is((select result #>> '{commands,queued,current_count}' from g016_snapshot),'2','all current queued rows are counted');
select is((select result #>> '{commands,queued,created_in_window_count}' from g016_snapshot),'1','queue window boundary is inclusive');
select is((select result #>> '{commands,queued,older_than_window_count}' from g016_snapshot),'1','older queued rows remain visible');
select is((select result #>> '{commands,queued,oldest_age_seconds}' from g016_snapshot),'3601','oldest queued age is stable integer seconds');
select is((select result #> '{commands,in_flight}' from g016_snapshot),
  '{"leased_count":1,"leased_overdue_count":1,"dispatching_count":1,"dispatching_overdue_count":0,"published_count":2,"published_overdue_count":1}'::jsonb,
  'all in-flight states and exact deadline boundaries are counted');
select is((select result #> '{commands,attention}' from g016_snapshot),
  '{"delivery_unknown_count":1,"dead_letter_count":1,"revocation_pending_count":1}'::jsonb,
  'all current attention states remain visible without window filtering');
select is((select result #>> '{ack_rejections,event_attempt_count}' from g016_snapshot),'13','only in-window unapplied ACK attempts are counted');
select is((select result #> '{ack_rejections,by_reason}' from g016_snapshot),
  '{"unknown_command":1,"device_not_owned":1,"unsupported_command_projection":1,"device_binding_mismatch":1,"authorization_epoch_mismatch":1,"boot_mismatch":1,"clock_unavailable":1,"clock_skew":1,"frame_expired":1,"command_expired":1,"illegal_ack_transition":1,"projection_conflict":1,"other":1}'::jsonb,
  'ACK taxonomy has every fixed key and maps unknown persisted reasons to other');
select is((select result #> '{trusted_shadows}' from g016_snapshot),
  '{"eligible_device_count":4,"fresh_count":1,"stale_count":1,"missing_count":2}'::jsonb,
  'trusted shadows classify missing, exact-boundary stale, and strictly fresh while excluding ineligible devices');
select ok((
  with recursive json_nodes(value) as (
    select result from g016_snapshot
    union all
    select child.value
    from json_nodes as parent
    cross join lateral (
      select object_child.value
      from jsonb_each(
        case jsonb_typeof(parent.value) when 'object' then parent.value else '{}'::jsonb end
      ) as object_child(key,value)
      union all
      select array_child.value
      from jsonb_array_elements(
        case jsonb_typeof(parent.value) when 'array' then parent.value else '[]'::jsonb end
      ) as array_child(value)
    ) as child(value)
  ), object_keys as (
    select child.key
    from json_nodes as parent
    cross join lateral jsonb_each(
      case jsonb_typeof(parent.value) when 'object' then parent.value else '{}'::jsonb end
    ) as child(key,value)
  )
  select not exists (
    select 1
    from object_keys
    where lower(key) = any(array[
      'device_id','command_id','owner_id','terminal_id','auth_session_id','boot_id',
      'fingerprint','frame_digest','signature','payload','reason','error','last_error_code',
      'transport_message_id'
    ])
  )
  and result::text not like '%a1620000%'
  and result::text not like '%must-not-leak%'
  and result::text not like '%transport-%'
  and result::text not like '%private_payload%'
  from g016_snapshot
), 'recursive output scan finds no sensitive keys or fixture identifier, payload, or transport values');
select ok((
  select b.command_count = (select count(*) from public.device_commands)
    and b.outbox_count = (select count(*) from private.device_command_outbox)
    and b.ack_count = (select count(*) from private.device_command_ack_events)
    and b.outbox_updated_at is not distinct from (select max(updated_at) from private.device_command_outbox)
  from g016_before_read b
), 'observability RPC is read-only');

set local role authenticated;
select throws_ok(
  $$select public.get_robot_operations_observability(3600,120)$$,
  '42501',
  null,
  'authenticated clients cannot execute the service operation RPC'
);
reset role;

select * from finish();
rollback;
