alter table public.devices
  add column robot_authority_version bigint not null default 1 check (robot_authority_version >= 1),
  add column robot_lifecycle text not null default 'unassigned'
    check (robot_lifecycle in ('unassigned','owned','quarantined','compromised','retired')),
  add column robot_public_key_pem text,
  add column robot_public_key_fingerprint text,
  add column robot_authorization_epoch bigint not null default 1 check (robot_authorization_epoch >= 1),
  add column robot_active_boot_id text,
  add column robot_last_telemetry_sequence bigint not null default 0 check (robot_last_telemetry_sequence >= 0),
  add column robot_last_telemetry_frame_digest text,
  add column trusted_sensor_status text check (trusted_sensor_status in ('ok','degraded')),
  add column trusted_network_status text check (trusted_network_status in ('online','offline')),
  add column trusted_telemetry_captured_at timestamptz,
  add column trusted_telemetry_received_at timestamptz,
  add constraint devices_robot_key_pair_check check (
    (robot_public_key_pem is null and robot_public_key_fingerprint is null)
    or (length(robot_public_key_pem) between 32 and 8192 and robot_public_key_fingerprint ~ '^[0-9a-f]{64}$')
  ),
  add constraint devices_robot_owner_lifecycle_check check (
    robot_lifecycle <> 'owned' or owner_id is not null
  );

update public.devices
set robot_lifecycle = case when owner_id is null then 'unassigned' else 'owned' end;

drop policy if exists "devices_insert_safe_demo" on public.devices;
create policy "devices_insert_safe_demo"
on public.devices for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and is_demo
  and serial_number is null
  and connection_status = 'offline'
  and safety_lock
  and battery_percent is null
  and firmware_version is null
  and runtime_hours = 0
  and last_seen_at is null
  and robot_authority_version = 1
  and robot_lifecycle = 'unassigned'
  and robot_public_key_pem is null
  and robot_public_key_fingerprint is null
  and robot_authorization_epoch = 1
  and robot_active_boot_id is null
  and robot_last_telemetry_sequence = 0
  and robot_last_telemetry_frame_digest is null
  and trusted_sensor_status is null
  and trusted_network_status is null
  and trusted_telemetry_captured_at is null
  and trusted_telemetry_received_at is null
  and (select private.is_account_active())
  and (select private.is_session_active())
);

create table public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  terminal_id uuid not null references public.account_terminals(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid not null,
  protocol_version smallint not null default 1 check (protocol_version = 1),
  authorization_epoch bigint not null check (authorization_epoch >= 1),
  expected_boot_id text not null check (length(expected_boot_id) between 3 and 127),
  expected_device_version bigint not null check (expected_device_version >= 1),
  expected_public_key_fingerprint text not null check (expected_public_key_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (length(idempotency_key) between 3 and 127),
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  policy_version bigint not null default 1 check (policy_version >= 1),
  safety_contract_id text not null default 'stationary-health-check' check (safety_contract_id = 'stationary-health-check'),
  safety_contract_version integer not null default 1 check (safety_contract_version = 1),
  capability text not null default 'command:diagnostics.health_check' check (capability = 'command:diagnostics.health_check'),
  kind text not null default 'diagnostics.health_check' check (kind = 'diagnostics.health_check'),
  command_class text not null default 'non_motion_diagnostic' check (command_class = 'non_motion_diagnostic'),
  may_actuate boolean not null default false check (not may_actuate),
  include_fields text[] not null check (
    cardinality(include_fields) between 1 and 3
    and include_fields <@ array['battery','network','sensors']::text[]
  ),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > issued_at),
  version bigint not null default 1 check (version >= 1),
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued','leased','published','completed','cancelled','dead_letter','delivery_unknown','revocation_pending')),
  ack_status text check (ack_status is null or ack_status in ('accepted','executing','succeeded','failed','rejected','expired','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(device_id,idempotency_key)
);

create index device_commands_owner_created_idx on public.device_commands(owner_id,created_at desc);
create index device_commands_device_status_idx on public.device_commands(device_id,delivery_status,created_at);

create table private.device_command_outbox (
  command_id uuid primary key references public.device_commands(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','leased','published','completed','cancelled','dead_letter','delivery_unknown','revocation_pending')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_token uuid,
  fencing_token bigint not null default 0 check (fencing_token >= 0),
  leased_until timestamptz,
  transport_message_id text,
  published_at timestamptz,
  ack_deadline timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now(),
  check ((status = 'leased') = (lease_token is not null and leased_until is not null)),
  check (status <> 'published' or (transport_message_id is not null and published_at is not null and ack_deadline is not null))
);

create index device_command_outbox_claim_idx
  on private.device_command_outbox(available_at,command_id)
  where status = 'queued';
create index device_command_outbox_timeout_idx
  on private.device_command_outbox(ack_deadline)
  where status = 'published';

create table private.device_command_ack_events (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  command_id text,
  frame_digest text not null check (frame_digest ~ '^[0-9a-f]{64}$'),
  authorization_epoch bigint not null check (authorization_epoch >= 1),
  idempotency_key text not null,
  boot_id text not null,
  status text not null check (status in ('accepted','executing','succeeded','failed','rejected','expired','cancelled')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  reason jsonb,
  signature_b64url text not null check (length(signature_b64url) between 16 and 1024),
  applied boolean not null,
  projection_reason text not null
);

create index device_command_ack_events_command_idx
  on private.device_command_ack_events(command_id,received_at,id);
create unique index device_command_ack_events_final_digest_idx
  on private.device_command_ack_events(frame_digest)
  where projection_reason not in ('clock_unavailable','projection_conflict');
create unique index device_command_ack_events_retryable_attempt_idx
  on private.device_command_ack_events(frame_digest,projection_reason)
  where projection_reason in ('clock_unavailable','projection_conflict');

create function private.prevent_robot_ack_event_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'robot ACK events are append-only' using errcode='42501';
end;
$$;
create trigger device_command_ack_events_append_only
before update or delete on private.device_command_ack_events
for each row execute function private.prevent_robot_ack_event_mutation();

alter table public.device_commands enable row level security;
alter table private.device_command_outbox enable row level security;
alter table private.device_command_ack_events enable row level security;

create policy device_commands_select_active_owner
on public.device_commands for select to authenticated
using (
  owner_id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
);

revoke all on table public.device_commands from public,anon,authenticated,service_role;
grant select on table public.device_commands to authenticated,service_role;
revoke all on table private.device_command_outbox from public,anon,authenticated,service_role;
revoke all on table private.device_command_ack_events from public,anon,authenticated,service_role;
revoke all on sequence private.device_command_ack_events_id_seq from public,anon,authenticated,service_role;

create function private.enforce_robot_device_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_authority_changed boolean;
  v_snapshot_changed boolean;
begin
  v_authority_changed := new.owner_id is distinct from old.owner_id
    or new.robot_lifecycle is distinct from old.robot_lifecycle
    or new.robot_public_key_pem is distinct from old.robot_public_key_pem
    or new.robot_public_key_fingerprint is distinct from old.robot_public_key_fingerprint
    or new.robot_authorization_epoch is distinct from old.robot_authorization_epoch
    or new.robot_active_boot_id is distinct from old.robot_active_boot_id;
  v_snapshot_changed := new.robot_last_telemetry_sequence is distinct from old.robot_last_telemetry_sequence
    or new.robot_last_telemetry_frame_digest is distinct from old.robot_last_telemetry_frame_digest
    or new.trusted_sensor_status is distinct from old.trusted_sensor_status
    or new.trusted_network_status is distinct from old.trusted_network_status
    or new.trusted_telemetry_captured_at is distinct from old.trusted_telemetry_captured_at
    or new.trusted_telemetry_received_at is distinct from old.trusted_telemetry_received_at
    or new.battery_percent is distinct from old.battery_percent
    or new.last_seen_at is distinct from old.last_seen_at
    or new.connection_status is distinct from old.connection_status;

  if (v_authority_changed or v_snapshot_changed) and current_user <> 'postgres' then
    raise exception 'trusted robot state is RPC-only' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    new.robot_authority_version := old.robot_authority_version + 1;
    new.robot_authorization_epoch := old.robot_authorization_epoch + 1;
    new.robot_lifecycle := case when new.owner_id is null then 'unassigned' else 'owned' end;
    new.robot_active_boot_id := null;
    new.robot_last_telemetry_sequence := 0;
    new.robot_last_telemetry_frame_digest := null;
    new.trusted_sensor_status := null;
    new.trusted_network_status := null;
    new.trusted_telemetry_captured_at := null;
    new.trusted_telemetry_received_at := null;
    new.battery_percent := null;
    new.last_seen_at := null;
    new.connection_status := 'offline';
  elsif v_authority_changed then
    if new.robot_authority_version <> old.robot_authority_version + 1 then
      raise exception 'robot authority version must increment exactly once';
    end if;
    if new.robot_authorization_epoch < old.robot_authorization_epoch then
      raise exception 'robot authorization epoch cannot roll back';
    end if;
    if new.robot_public_key_pem is distinct from old.robot_public_key_pem
       or new.robot_public_key_fingerprint is distinct from old.robot_public_key_fingerprint
       or new.robot_lifecycle is distinct from old.robot_lifecycle
       or new.robot_active_boot_id is distinct from old.robot_active_boot_id then
      if new.robot_authorization_epoch <= old.robot_authorization_epoch then
        raise exception 'authority identity changes must advance authorization epoch';
      end if;
      new.robot_last_telemetry_sequence := 0;
      new.robot_last_telemetry_frame_digest := null;
      new.trusted_sensor_status := null;
      new.trusted_network_status := null;
      new.trusted_telemetry_captured_at := null;
      new.trusted_telemetry_received_at := null;
      new.battery_percent := null;
      new.last_seen_at := null;
      new.connection_status := 'offline';
    end if;
  elsif new.robot_authority_version <> old.robot_authority_version then
    raise exception 'robot authority version cannot change without authority change';
  end if;
  return new;
end;
$$;

create trigger devices_enforce_robot_update
before update on public.devices
for each row execute function private.enforce_robot_device_update();

create function private.cancel_robot_commands_for_authority_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.robot_lifecycle is distinct from old.robot_lifecycle
     or new.robot_public_key_fingerprint is distinct from old.robot_public_key_fingerprint
     or new.robot_authorization_epoch is distinct from old.robot_authorization_epoch
     or new.robot_active_boot_id is distinct from old.robot_active_boot_id then
    update public.device_commands
    set delivery_status = case when delivery_status = 'published' then 'revocation_pending' else 'cancelled' end,
        version = version + 1,
        updated_at = now()
    where device_id = new.id
      and delivery_status in ('queued','leased','published');
    update private.device_command_outbox o
    set status = case when o.status = 'published' then 'revocation_pending' else 'cancelled' end,
        lease_token = null, leased_until = null, updated_at = now()
    from public.device_commands c
    where c.id = o.command_id and c.device_id = new.id
      and o.status in ('queued','leased','published');
  end if;
  return null;
end;
$$;

create trigger devices_cancel_robot_commands
after update on public.devices
for each row execute function private.cancel_robot_commands_for_authority_change();

create function private.invalidate_robot_authority(p_device_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason is null or length(btrim(p_reason)) not between 3 and 100 then
    raise exception 'invalid robot authority invalidation reason';
  end if;
  update public.devices
  set robot_authority_version = robot_authority_version + 1,
      robot_authorization_epoch = robot_authorization_epoch + 1,
      robot_active_boot_id = null,
      robot_lifecycle = case when owner_id is null then 'unassigned' else robot_lifecycle end,
      updated_at = now()
  where id = p_device_id;
end;
$$;

create function private.invalidate_robot_authority_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_device record;
begin
  if new.account_status is distinct from old.account_status and new.account_status <> 'active' then
    for v_device in select id from public.devices where owner_id = new.id loop
      perform private.invalidate_robot_authority(v_device.id,'account_status_changed');
    end loop;
  end if;
  return null;
end;
$$;

create trigger profiles_invalidate_robot_authority
after update of account_status on public.profiles
for each row execute function private.invalidate_robot_authority_for_profile();

create function private.invalidate_robot_authority_for_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_device record;
begin
  if old.revoked_at is null and new.revoked_at is not null then
    for v_device in select id from public.devices where owner_id = new.user_id loop
      perform private.invalidate_robot_authority(v_device.id,'terminal_revoked');
    end loop;
  end if;
  return null;
end;
$$;

create trigger terminals_invalidate_robot_authority
after update of revoked_at on public.account_terminals
for each row execute function private.invalidate_robot_authority_for_terminal();

create function public.provision_robot_device_authority(
  p_device_id uuid,
  p_public_key_pem text,
  p_public_key_fingerprint text,
  p_active_boot_id text,
  p_reason text default 'manufacturing_provisioning'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_device public.devices; v_der bytea; v_b64 text; v_computed_fingerprint text;
begin
  if p_device_id is null
     or p_public_key_pem is null
     or p_public_key_fingerprint is null
     or p_active_boot_id is null
     or p_reason is null
     or p_public_key_fingerprint !~ '^[0-9a-f]{64}$'
     or p_active_boot_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'
     or length(btrim(p_reason)) not between 3 and 100
     or p_public_key_pem !~ '^-----BEGIN PUBLIC KEY-----[[:space:]]+[A-Za-z0-9+/=[:space:]]+[[:space:]]+-----END PUBLIC KEY-----[[:space:]]*$' then
    raise exception 'invalid robot authority provisioning input';
  end if;
  begin
    v_b64 := regexp_replace(
      replace(replace(p_public_key_pem,'-----BEGIN PUBLIC KEY-----',''),'-----END PUBLIC KEY-----',''),
      '[[:space:]]','','g');
    v_der := decode(v_b64,'base64');
  exception when others then
    raise exception 'invalid Ed25519 SubjectPublicKeyInfo';
  end;
  if octet_length(v_der) <> 44
     or substring(v_der from 1 for 12) <> decode('302a300506032b6570032100','hex') then
    raise exception 'invalid Ed25519 SubjectPublicKeyInfo';
  end if;
  v_computed_fingerprint := encode(extensions.digest(v_der,'sha256'),'hex');
  if p_public_key_fingerprint is distinct from v_computed_fingerprint then
    raise exception 'robot public key fingerprint mismatch';
  end if;
  select * into v_device from public.devices where id=p_device_id for update;
  if v_device.id is null or v_device.owner_id is null or v_device.is_demo
     or v_device.robot_lifecycle in ('quarantined','compromised','retired') then
    raise exception 'provisionable owned device is required';
  end if;
  update public.devices
  set robot_authority_version=robot_authority_version+1,
      robot_authorization_epoch=robot_authorization_epoch+1,
      robot_lifecycle='owned',
      robot_public_key_pem=p_public_key_pem,
      robot_public_key_fingerprint=p_public_key_fingerprint,
      robot_active_boot_id=p_active_boot_id,
      updated_at=now()
  where id=p_device_id
  returning * into v_device;
  insert into public.audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,metadata)
  values(null,v_device.owner_id,'robot.authority_provisioned','device',v_device.id::text,
    jsonb_build_object('publicKeyFingerprint',v_device.robot_public_key_fingerprint,'reason',btrim(p_reason),
      'authorityVersion',v_device.robot_authority_version,'authorizationEpoch',v_device.robot_authorization_epoch));
  return jsonb_build_object(
    'device_id',v_device.id,
    'owner_id',v_device.owner_id,
    'lifecycle',v_device.robot_lifecycle,
    'authority_version',v_device.robot_authority_version,
    'authorization_epoch',v_device.robot_authorization_epoch,
    'public_key_fingerprint',v_device.robot_public_key_fingerprint,
    'active_boot_id',v_device.robot_active_boot_id
  );
end;
$$;

create function public.create_robot_health_check(
  p_device_id uuid,
  p_idempotency_key text,
  p_include_fields text[] default array['battery','network','sensors']::text[],
  p_ttl_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := private.current_session_id();
  v_terminal public.account_terminals;
  v_device public.devices;
  v_include text[];
  v_digest text;
  v_command public.device_commands;
begin
  if v_user_id is null or v_session_id is null or not private.is_account_active() or not private.is_session_active() then
    raise exception 'active authenticated session is required';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 3 and 127 then
    raise exception 'invalid idempotency key';
  end if;
  if p_ttl_seconds not between 5 and 60 then raise exception 'invalid command ttl'; end if;
  select array_agg(distinct value order by value) into v_include from unnest(p_include_fields) value;
  if v_include is null or cardinality(v_include) not between 1 and 3
     or not (v_include <@ array['battery','network','sensors']::text[]) then
    raise exception 'invalid health check include fields';
  end if;
  select * into v_terminal from public.account_terminals
  where user_id=v_user_id and auth_session_id=v_session_id and revoked_at is null for update;
  if v_terminal.id is null then raise exception 'active terminal is required'; end if;
  select * into v_device from public.devices where id=p_device_id for update;
  if v_device.id is null or v_device.owner_id is distinct from v_user_id or v_device.is_demo
     or v_device.robot_lifecycle <> 'owned' or v_device.robot_public_key_fingerprint is null
     or v_device.robot_active_boot_id is null then raise exception 'trusted owned robot is required'; end if;
  v_digest := encode(extensions.digest(convert_to(jsonb_build_object(
    'protocol_version',1,
    'device_id',p_device_id,
    'owner_id',v_user_id,
    'terminal_id',v_terminal.id,
    'auth_session_id',v_session_id,
    'authorization_epoch',v_device.robot_authorization_epoch,
    'expected_boot_id',v_device.robot_active_boot_id,
    'expected_device_version',v_device.robot_authority_version,
    'expected_public_key_fingerprint',v_device.robot_public_key_fingerprint,
    'ttl_seconds',p_ttl_seconds,
    'policy_version',1,
    'safety_contract_id','stationary-health-check',
    'safety_contract_version',1,
    'capability','command:diagnostics.health_check',
    'kind','diagnostics.health_check',
    'command_class','non_motion_diagnostic',
    'may_actuate',false,
    'include_fields',to_jsonb(v_include)
  )::text,'UTF8'),'sha256'),'hex');
  select * into v_command from public.device_commands
  where device_id=p_device_id and idempotency_key=btrim(p_idempotency_key) for update;
  if v_command.id is not null then
    if v_command.request_digest <> v_digest then raise exception 'idempotency key conflicts with another request'; end if;
    return jsonb_build_object('command_id',v_command.id,'created',false,'delivery_status',v_command.delivery_status,'ack_status',v_command.ack_status);
  end if;
  insert into public.device_commands(
    device_id,owner_id,terminal_id,actor_user_id,auth_session_id,authorization_epoch,expected_boot_id,
    expected_device_version,expected_public_key_fingerprint,idempotency_key,request_digest,include_fields,issued_at,expires_at
  ) values (
    p_device_id,v_user_id,v_terminal.id,v_user_id,v_session_id,v_device.robot_authorization_epoch,v_device.robot_active_boot_id,
    v_device.robot_authority_version,v_device.robot_public_key_fingerprint,btrim(p_idempotency_key),v_digest,v_include,now(),now()+make_interval(secs=>p_ttl_seconds)
  ) returning * into v_command;
  insert into private.device_command_outbox(command_id) values(v_command.id);
  insert into public.audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,metadata)
  values(v_user_id,v_user_id,'robot.command_created','device_command',v_command.id::text,
    jsonb_build_object('deviceId',p_device_id,'kind','diagnostics.health_check','mayActuate',false));
  return jsonb_build_object('command_id',v_command.id,'created',true,'delivery_status','queued','ack_status',null);
exception when unique_violation then
  select * into v_command from public.device_commands where device_id=p_device_id and idempotency_key=btrim(p_idempotency_key);
  if v_command.id is null or v_command.request_digest <> v_digest then raise exception 'idempotency key conflicts with another request'; end if;
  return jsonb_build_object('command_id',v_command.id,'created',false,'delivery_status',v_command.delivery_status,'ack_status',v_command.ack_status);
end;
$$;

create function public.claim_robot_command_for_publish(
  p_worker_id uuid,
  p_lease_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_outbox private.device_command_outbox; v_command public.device_commands; v_device public.devices;
begin
  if p_worker_id is null or p_lease_seconds not between 5 and 120 then raise exception 'invalid worker lease'; end if;
  select o.* into v_outbox from private.device_command_outbox o
  join public.device_commands c on c.id=o.command_id
  where o.status='queued' and o.available_at<=now() and c.delivery_status='queued'
  order by o.available_at,o.command_id for update of o skip locked limit 1;
  if v_outbox.command_id is null then return null; end if;
  select * into v_command from public.device_commands where id=v_outbox.command_id for update;
  select * into v_device from public.devices where id=v_command.device_id for update;
  if v_device.id is null or v_device.owner_id is distinct from v_command.owner_id or v_device.robot_lifecycle<>'owned'
     or v_device.robot_authorization_epoch<>v_command.authorization_epoch or v_device.robot_active_boot_id is distinct from v_command.expected_boot_id
     or v_device.robot_authority_version<>v_command.expected_device_version
     or v_device.robot_public_key_fingerprint is distinct from v_command.expected_public_key_fingerprint
     or not exists (select 1 from public.profiles p where p.id=v_command.owner_id and p.account_status='active')
     or not exists (select 1 from public.account_terminals t where t.id=v_command.terminal_id
       and t.user_id=v_command.owner_id and t.auth_session_id=v_command.auth_session_id and t.revoked_at is null)
     or now()>=v_command.expires_at then
    update private.device_command_outbox set status='cancelled',updated_at=now() where command_id=v_command.id;
    update public.device_commands set delivery_status='cancelled',version=version+1,updated_at=now() where id=v_command.id;
    return jsonb_build_object('claimed',false,'reason','authority_changed');
  end if;
  update private.device_command_outbox set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),
    fencing_token=fencing_token+1,leased_until=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  where command_id=v_command.id returning * into v_outbox;
  update public.device_commands set delivery_status='leased',version=version+1,updated_at=now() where id=v_command.id returning * into v_command;
  return jsonb_build_object('claimed',true,'command_id',v_command.id,'lease_token',v_outbox.lease_token,
    'fencing_token',v_outbox.fencing_token,'leased_until',v_outbox.leased_until,
    'command',jsonb_build_object('protocol_version',v_command.protocol_version,'command_id',v_command.id,'device_id',v_command.device_id,
      'owner_account_id',v_command.owner_id,'terminal_id',v_command.terminal_id,'actor_user_id',v_command.actor_user_id,
      'authorization_epoch',v_command.authorization_epoch,'idempotency_key',v_command.idempotency_key,'auth_session_id',v_command.auth_session_id,
      'policy_version',v_command.policy_version,'safety_contract_id',v_command.safety_contract_id,'safety_contract_version',v_command.safety_contract_version,
      'capability',v_command.capability,'kind',v_command.kind,'command_class',v_command.command_class,'may_actuate',v_command.may_actuate,
      'expected_state',jsonb_build_object('authorization_epoch',v_command.authorization_epoch,'boot_id',v_command.expected_boot_id),
      'issued_at_ms',floor(extract(epoch from v_command.issued_at)*1000)::bigint,'expires_at_ms',floor(extract(epoch from v_command.expires_at)*1000)::bigint,
      'payload',jsonb_build_object('include',to_jsonb(v_command.include_fields))));
end;
$$;

create function public.finish_robot_command_publish(
  p_command_id uuid,p_lease_token uuid,p_fencing_token bigint,p_outcome text,
  p_transport_message_id text default null,p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_outbox private.device_command_outbox; v_command public.device_commands; v_device public.devices; v_status text;
begin
  select * into v_outbox from private.device_command_outbox where command_id=p_command_id for update;
  if v_outbox.command_id is null or v_outbox.status<>'leased' or v_outbox.lease_token is distinct from p_lease_token
     or v_outbox.fencing_token<>p_fencing_token or v_outbox.leased_until<=now() then
    return jsonb_build_object('applied',false,'reason','stale_lease');
  end if;
  select * into v_command from public.device_commands where id=p_command_id for update;
  select * into v_device from public.devices where id=v_command.device_id for update;
  if v_device.owner_id is distinct from v_command.owner_id or v_device.robot_lifecycle<>'owned'
     or v_device.robot_authorization_epoch<>v_command.authorization_epoch or v_device.robot_active_boot_id is distinct from v_command.expected_boot_id
     or v_device.robot_authority_version<>v_command.expected_device_version
     or v_device.robot_public_key_fingerprint is distinct from v_command.expected_public_key_fingerprint
     or not exists (select 1 from public.profiles p where p.id=v_command.owner_id and p.account_status='active')
     or not exists (select 1 from public.account_terminals t where t.id=v_command.terminal_id
       and t.user_id=v_command.owner_id and t.auth_session_id=v_command.auth_session_id and t.revoked_at is null)
     or now()>=v_command.expires_at then
    update private.device_command_outbox set status='cancelled',lease_token=null,leased_until=null,updated_at=now() where command_id=p_command_id;
    update public.device_commands set delivery_status='cancelled',version=version+1,updated_at=now() where id=p_command_id;
    return jsonb_build_object('applied',false,'reason','authority_changed');
  end if;
  if p_outcome='published' then
    if p_transport_message_id is null or length(btrim(p_transport_message_id)) not between 3 and 200 then raise exception 'transport message id required'; end if;
    update private.device_command_outbox set status='published',lease_token=null,leased_until=null,
      transport_message_id=btrim(p_transport_message_id),published_at=now(),ack_deadline=now()+interval '30 seconds',updated_at=now()
    where command_id=p_command_id;
    update public.device_commands set delivery_status='published',version=version+1,updated_at=now() where id=p_command_id;
    return jsonb_build_object('applied',true,'delivery_status','published','ack_status',null);
  elsif p_outcome='transport_failure' then
    v_status:=case when v_outbox.attempts>=v_outbox.max_attempts then 'dead_letter' else 'queued' end;
    update private.device_command_outbox set status=v_status,lease_token=null,leased_until=null,
      available_at=case when v_status='queued' then now()+make_interval(secs=>least(60,2^attempts)::integer) else available_at end,
      last_error_code=left(coalesce(p_error_code,'transport_failure'),100),updated_at=now() where command_id=p_command_id;
    update public.device_commands set delivery_status=v_status,version=version+1,updated_at=now() where id=p_command_id;
    return jsonb_build_object('applied',true,'delivery_status',v_status,'ack_status',null);
  elsif p_outcome='delivery_unknown' then
    update private.device_command_outbox set status='delivery_unknown',lease_token=null,leased_until=null,
      last_error_code=left(coalesce(p_error_code,'publish_outcome_unknown'),100),updated_at=now() where command_id=p_command_id;
    update public.device_commands set delivery_status='delivery_unknown',version=version+1,updated_at=now() where id=p_command_id;
    return jsonb_build_object('applied',true,'delivery_status','delivery_unknown','ack_status',null);
  end if;
  raise exception 'invalid publish outcome';
end;
$$;

create function public.reconcile_robot_command_timeouts(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer:=0; v_row record; v_status text;
begin
  if p_limit not between 1 and 1000 then raise exception 'invalid reconcile limit'; end if;
  for v_row in select * from private.device_command_outbox
    where (status='leased' and leased_until<=now()) or (status='published' and ack_deadline<=now())
    order by updated_at for update skip locked limit p_limit loop
    if v_row.status='published' then v_status:='delivery_unknown';
    else v_status:=case when v_row.attempts>=v_row.max_attempts then 'dead_letter' else 'queued' end; end if;
    update private.device_command_outbox set status=v_status,lease_token=null,leased_until=null,
      available_at=case when v_status='queued' then now()+interval '1 second' else available_at end,
      last_error_code=case when v_row.status='published' then 'ack_timeout_unknown' else 'lease_expired' end,updated_at=now()
    where command_id=v_row.command_id;
    update public.device_commands set delivery_status=v_status,version=version+1,updated_at=now() where id=v_row.command_id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create function public.get_robot_ingress_context(p_device_id uuid,p_command_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_device public.devices; v_command public.device_commands;
begin
  select * into v_device from public.devices where id=p_device_id;
  if v_device.id is null then return jsonb_build_object('found',false,'device',null,'command',null); end if;
  if p_command_id is not null then select * into v_command from public.device_commands where id=p_command_id; end if;
  return jsonb_build_object('found',true,'device',jsonb_build_object(
    'version',v_device.robot_authority_version,'device_id',v_device.id,'owner_account_id',v_device.owner_id,
    'public_key_pem',v_device.robot_public_key_pem,'public_key_fingerprint',v_device.robot_public_key_fingerprint,
    'lifecycle',v_device.robot_lifecycle,'authorization_epoch',v_device.robot_authorization_epoch,
    'active_boot_id',v_device.robot_active_boot_id,'last_telemetry_sequence',v_device.robot_last_telemetry_sequence),
    'command',case when v_command.id is null then null else jsonb_build_object(
      'version',v_command.version,'command_id',v_command.id,'device_id',v_command.device_id,'owner_account_id',v_command.owner_id,
      'authorization_epoch',v_command.authorization_epoch,'expected_boot_id',v_command.expected_boot_id,
      'expected_device_version',v_command.expected_device_version,'expected_public_key_fingerprint',v_command.expected_public_key_fingerprint,
      'idempotency_key',v_command.idempotency_key,'expires_at_ms',floor(extract(epoch from v_command.expires_at)*1000)::bigint,
      'kind',v_command.kind,'capability',v_command.capability,'command_class',v_command.command_class,'may_actuate',v_command.may_actuate,
      'safety_contract_id',v_command.safety_contract_id,'safety_contract_version',v_command.safety_contract_version,'ack_status',v_command.ack_status) end);
end;
$$;

create function private.robot_ack_transition_allowed(p_current text,p_incoming text)
returns boolean language sql immutable set search_path='' as $$
  select case
    when p_current is null then p_incoming='accepted' or p_incoming in ('succeeded','failed','rejected','expired','cancelled')
    when p_current in ('succeeded','failed','rejected','expired','cancelled') then false
    when p_current='accepted' then p_incoming='executing' or p_incoming in ('succeeded','failed','rejected','expired','cancelled')
    when p_current='executing' then p_incoming in ('succeeded','failed','rejected','expired','cancelled')
    else false end;
$$;

create function public.ingest_verified_robot_ack(
  p_device_fence jsonb,p_command_fence jsonb,p_ack jsonb,p_signature_b64url text,p_frame_digest text,
  p_precheck_rejection text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_device public.devices; v_command public.device_commands; v_event_id bigint; v_applied boolean:=false;
  v_reason text:='unknown_command'; v_status text; v_occurred_at timestamptz; v_existing private.device_command_ack_events;
begin
  if p_frame_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid frame digest'; end if;
  if p_precheck_rejection is not null and p_precheck_rejection not in (
    'unknown_command','device_not_owned','unsupported_command_projection','device_binding_mismatch',
    'authorization_epoch_mismatch','boot_mismatch','clock_unavailable','clock_skew',
    'frame_expired','command_expired','illegal_ack_transition','projection_conflict'
  ) then
    raise exception 'invalid ACK precheck rejection';
  end if;
  select * into v_device from public.devices where id=(p_ack->>'device_id')::uuid for update;
  if v_device.id is null then return jsonb_build_object('stored',false,'applied',false,'retryable',false,'reason','unknown_device','event_id',null); end if;
  select * into v_existing from private.device_command_ack_events
  where frame_digest=p_frame_digest and projection_reason not in ('clock_unavailable','projection_conflict')
  order by id limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('stored',true,'applied',false,'retryable',false,'reason','duplicate','status',v_existing.status,
      'device_version',null,'command_version',null,'event_id',v_existing.id);
  end if;
  v_status:=p_ack->>'status';
  if v_status not in ('accepted','executing','succeeded','failed','rejected','expired','cancelled') then raise exception 'invalid ACK status'; end if;
  v_occurred_at:=to_timestamp(((p_ack->>'occurred_at_ms')::bigint)/1000.0);
  if p_precheck_rejection is not null then v_reason:=p_precheck_rejection;
  elsif abs(extract(epoch from (now()-v_occurred_at)))>60 then v_reason:='frame_expired';
  elsif (p_device_fence->>'device_id')::uuid is distinct from v_device.id
    or (p_device_fence->>'version')::bigint is distinct from v_device.robot_authority_version
    or p_device_fence->>'owner_account_id' is distinct from v_device.owner_id::text
    or p_device_fence->>'public_key_fingerprint' is distinct from v_device.robot_public_key_fingerprint
    or (p_device_fence->>'authorization_epoch')::bigint is distinct from v_device.robot_authorization_epoch
    or p_device_fence->>'active_boot_id' is distinct from v_device.robot_active_boot_id
    or v_device.robot_lifecycle<>'owned' then v_reason:='projection_conflict';
  else
    begin select * into v_command from public.device_commands where id=(p_ack->>'command_id')::uuid for update;
    exception when invalid_text_representation then v_command:=null; end;
    if v_command.id is null then v_reason:='unknown_command';
    elsif p_command_fence is null
      or (p_command_fence->>'command_id')::uuid is distinct from v_command.id
      or (p_command_fence->>'version')::bigint is distinct from v_command.version
      or p_command_fence->>'device_id' is distinct from v_command.device_id::text
      or p_command_fence->>'owner_account_id' is distinct from v_command.owner_id::text
      or (p_command_fence->>'authorization_epoch')::bigint is distinct from v_command.authorization_epoch
      or p_command_fence->>'expected_boot_id' is distinct from v_command.expected_boot_id
      or (p_command_fence->>'expected_device_version')::bigint is distinct from v_command.expected_device_version
      or p_command_fence->>'expected_public_key_fingerprint' is distinct from v_command.expected_public_key_fingerprint
      or p_command_fence->>'idempotency_key' is distinct from v_command.idempotency_key
      or p_command_fence->>'kind' is distinct from v_command.kind
      or p_command_fence->>'capability' is distinct from v_command.capability
      or p_command_fence->>'command_class' is distinct from v_command.command_class
      or (p_command_fence->>'may_actuate')::boolean is distinct from v_command.may_actuate
      or p_command_fence->>'safety_contract_id' is distinct from v_command.safety_contract_id
      or (p_command_fence->>'safety_contract_version')::integer is distinct from v_command.safety_contract_version
      or p_ack->>'device_id' is distinct from v_command.device_id::text
      or p_ack->>'idempotency_key' is distinct from v_command.idempotency_key
      or (p_ack->>'authorization_epoch')::bigint is distinct from v_command.authorization_epoch
      or p_ack->>'boot_id' is distinct from v_command.expected_boot_id
      or v_command.owner_id is distinct from v_device.owner_id
      or v_command.authorization_epoch is distinct from v_device.robot_authorization_epoch
      or v_command.expected_boot_id is distinct from v_device.robot_active_boot_id
      or v_command.expected_device_version is distinct from v_device.robot_authority_version
      or v_command.expected_public_key_fingerprint is distinct from v_device.robot_public_key_fingerprint then v_reason:='projection_conflict';
    elsif now()>=v_command.expires_at+interval '5 seconds' then v_reason:='command_expired';
    elsif not private.robot_ack_transition_allowed(v_command.ack_status,v_status) then v_reason:='illegal_ack_transition';
    else v_applied:=true; v_reason:='applied'; end if;
  end if;
  insert into private.device_command_ack_events(device_id,command_id,frame_digest,authorization_epoch,idempotency_key,boot_id,status,
    occurred_at,reason,signature_b64url,applied,projection_reason)
  values(v_device.id,p_ack->>'command_id',p_frame_digest,(p_ack->>'authorization_epoch')::bigint,
    p_ack->>'idempotency_key',p_ack->>'boot_id',v_status,v_occurred_at,p_ack->'reason',p_signature_b64url,v_applied,v_reason)
  on conflict do nothing
  returning id into v_event_id;
  if v_event_id is null then
    select * into v_existing from private.device_command_ack_events
    where frame_digest=p_frame_digest and projection_reason not in ('clock_unavailable','projection_conflict')
    order by id limit 1;
    if v_existing.id is not null then
      return jsonb_build_object('stored',true,'applied',false,'retryable',false,'reason','duplicate','status',v_existing.status,
      'device_version',null,'command_version',null,'event_id',v_existing.id);
    end if;
    select * into v_existing from private.device_command_ack_events
    where frame_digest=p_frame_digest and projection_reason=v_reason order by id limit 1;
    return jsonb_build_object('stored',true,'applied',false,'retryable',true,'reason',v_existing.projection_reason,'status',v_existing.status,
      'device_version',v_device.robot_authority_version,'command_version',case when v_command.id is null then null else v_command.version end,
      'event_id',v_existing.id);
  end if;
  if v_applied then
    update public.device_commands set ack_status=v_status,version=version+1,
      delivery_status=case when v_status in ('succeeded','failed','rejected','expired','cancelled') then 'completed' else delivery_status end,
      updated_at=now() where id=v_command.id returning * into v_command;
    if v_status in ('succeeded','failed','rejected','expired','cancelled') then
      update private.device_command_outbox set status='completed',ack_deadline=null,updated_at=now() where command_id=v_command.id;
    end if;
  end if;
  return jsonb_build_object('stored',true,'applied',v_applied,'retryable',v_reason in ('projection_conflict','clock_unavailable'),'reason',v_reason,'status',v_status,
    'device_version',v_device.robot_authority_version,'command_version',case when v_command.id is null then null else v_command.version end,'event_id',v_event_id);
end;
$$;

create function public.ingest_verified_robot_telemetry(p_device_fence jsonb,p_frame jsonb,p_frame_digest text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_device public.devices; v_sequence bigint; v_captured timestamptz; v_battery integer; v_sensor text; v_network text; v_reason text;
begin
  if p_frame_digest !~ '^[0-9a-f]{64}$' then raise exception 'invalid frame digest'; end if;
  select * into v_device from public.devices where id=(p_frame->>'device_id')::uuid for update;
  if v_device.id is null then return jsonb_build_object('stored',false,'applied',false,'retryable',false,'reason','unknown_device','sequence',null,'device_version',null); end if;
  v_sequence:=(p_frame->>'sequence')::bigint;
  v_captured:=to_timestamp(((p_frame->>'captured_at_ms')::bigint)/1000.0);
  v_battery:=(p_frame->'payload'->>'battery_percent')::integer;
  v_sensor:=p_frame->'payload'->>'sensor_status'; v_network:=p_frame->'payload'->>'network_status';
  if p_frame_digest=v_device.robot_last_telemetry_frame_digest then v_reason:='duplicate';
  elsif abs(extract(epoch from (now()-v_captured)))>60 then v_reason:='frame_expired';
  elsif (p_device_fence->>'device_id')::uuid is distinct from v_device.id
    or (p_device_fence->>'version')::bigint is distinct from v_device.robot_authority_version
    or p_device_fence->>'owner_account_id' is distinct from v_device.owner_id::text
    or p_device_fence->>'public_key_fingerprint' is distinct from v_device.robot_public_key_fingerprint
    or (p_device_fence->>'authorization_epoch')::bigint is distinct from v_device.robot_authorization_epoch
    or p_device_fence->>'active_boot_id' is distinct from v_device.robot_active_boot_id
    or v_device.robot_lifecycle<>'owned' then v_reason:='projection_conflict';
  elsif p_frame->>'device_id' is distinct from v_device.id::text
    or (p_frame->>'protocol_version')::integer is distinct from 1
    or p_frame->>'kind' is distinct from 'diagnostics.health'
    or (p_frame->>'authorization_epoch')::bigint is distinct from v_device.robot_authorization_epoch
    or p_frame->>'boot_id' is distinct from v_device.robot_active_boot_id then v_reason:='projection_conflict';
  elsif v_sequence<=v_device.robot_last_telemetry_sequence then v_reason:='sequence_replay';
  elsif v_battery not between 0 and 100 or v_sensor not in ('ok','degraded') or v_network not in ('online','offline') then v_reason:='invalid_payload';
  else
    update public.devices set robot_last_telemetry_sequence=v_sequence,robot_last_telemetry_frame_digest=p_frame_digest,
      trusted_sensor_status=v_sensor,trusted_network_status=v_network,trusted_telemetry_captured_at=v_captured,
      trusted_telemetry_received_at=now(),battery_percent=v_battery,last_seen_at=now(),connection_status=case when v_network='online' then 'online' else 'offline' end,
      updated_at=now() where id=v_device.id returning * into v_device;
    return jsonb_build_object('stored',true,'applied',true,'retryable',false,'reason','applied','sequence',v_sequence,'device_version',v_device.robot_authority_version);
  end if;
  return jsonb_build_object('stored',false,'applied',false,'retryable',v_reason='projection_conflict','reason',v_reason,'sequence',v_sequence,'device_version',v_device.robot_authority_version);
end;
$$;

create function public.get_my_robot_command_status(p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_command public.device_commands;
begin
  if auth.uid() is null or not private.is_account_active() or not private.is_session_active() then raise exception 'active authenticated session is required'; end if;
  select * into v_command from public.device_commands where id=p_command_id and owner_id=auth.uid();
  if v_command.id is null then return null; end if;
  return jsonb_build_object('command_id',v_command.id,'device_id',v_command.device_id,'kind',v_command.kind,
    'delivery_status',v_command.delivery_status,'ack_status',v_command.ack_status,'issued_at',v_command.issued_at,'expires_at',v_command.expires_at);
end;
$$;

revoke all on function private.enforce_robot_device_update() from public,anon,authenticated,service_role;
revoke all on function private.prevent_robot_ack_event_mutation() from public,anon,authenticated,service_role;
revoke all on function private.cancel_robot_commands_for_authority_change() from public,anon,authenticated,service_role;
revoke all on function private.invalidate_robot_authority(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.invalidate_robot_authority_for_profile() from public,anon,authenticated,service_role;
revoke all on function private.invalidate_robot_authority_for_terminal() from public,anon,authenticated,service_role;
revoke all on function private.robot_ack_transition_allowed(text,text) from public,anon,authenticated,service_role;

revoke all on function public.create_robot_health_check(uuid,text,text[],integer) from public,anon,authenticated,service_role;
grant execute on function public.create_robot_health_check(uuid,text,text[],integer) to authenticated;
revoke all on function public.provision_robot_device_authority(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.provision_robot_device_authority(uuid,text,text,text,text) to service_role;
revoke all on function public.claim_robot_command_for_publish(uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.finish_robot_command_publish(uuid,uuid,bigint,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_robot_command_timeouts(integer) from public,anon,authenticated,service_role;
revoke all on function public.get_robot_ingress_context(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ingest_verified_robot_ack(jsonb,jsonb,jsonb,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.ingest_verified_robot_telemetry(jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_robot_command_for_publish(uuid,integer) to service_role;
grant execute on function public.finish_robot_command_publish(uuid,uuid,bigint,text,text,text) to service_role;
grant execute on function public.reconcile_robot_command_timeouts(integer) to service_role;
grant execute on function public.get_robot_ingress_context(uuid,uuid) to service_role;
grant execute on function public.ingest_verified_robot_ack(jsonb,jsonb,jsonb,text,text,text) to service_role;
grant execute on function public.ingest_verified_robot_telemetry(jsonb,jsonb,text) to service_role;
revoke all on function public.get_my_robot_command_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_robot_command_status(uuid) to authenticated;

comment on table public.device_commands is 'Non-motion robot command projection. Transport publication never means device success.';
comment on table private.device_command_outbox is 'RPC-only robot command outbox. Published ambiguity is terminal delivery_unknown and is never auto-retried.';
comment on table private.device_command_ack_events is 'Append-only events accepted only after Edge verification; applied=false records trusted duplicates, unknown commands, and illegal transitions.';
