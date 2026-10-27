alter table public.device_commands
  drop constraint device_commands_delivery_status_check,
  add constraint device_commands_delivery_status_check
    check (delivery_status in (
      'queued','leased','dispatching','published','completed','cancelled',
      'dead_letter','delivery_unknown','revocation_pending'
    ));

alter table private.device_command_outbox
  drop constraint device_command_outbox_status_check,
  drop constraint device_command_outbox_check,
  add constraint device_command_outbox_status_check
    check (status in (
      'queued','leased','dispatching','published','completed','cancelled',
      'dead_letter','delivery_unknown','revocation_pending'
    )),
  add constraint device_command_outbox_lease_state_check
    check (
      (status in ('leased','dispatching'))
      = (lease_token is not null and leased_until is not null)
    );

create index device_command_outbox_dispatch_timeout_idx
  on private.device_command_outbox(leased_until,command_id)
  where status in ('leased','dispatching');

create or replace function private.cancel_robot_commands_for_authority_change()
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
    set delivery_status = case
          when delivery_status in ('dispatching','published') then 'revocation_pending'
          else 'cancelled'
        end,
        version = version + 1,
        updated_at = now()
    where device_id = new.id
      and delivery_status in ('queued','leased','dispatching','published');

    update private.device_command_outbox o
    set status = case
          when o.status in ('dispatching','published') then 'revocation_pending'
          else 'cancelled'
        end,
        lease_token = null,
        leased_until = null,
        updated_at = now()
    from public.device_commands c
    where c.id = o.command_id
      and c.device_id = new.id
      and o.status in ('queued','leased','dispatching','published');
  end if;
  return null;
end;
$$;

create function public.begin_robot_command_publish(
  p_command_id uuid,
  p_lease_token uuid,
  p_fencing_token bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outbox private.device_command_outbox;
  v_command public.device_commands;
  v_device public.devices;
  v_reason text;
  v_rows integer;
begin
  if p_command_id is null or p_lease_token is null or p_fencing_token is null or p_fencing_token < 1 then
    raise exception 'invalid publish lease';
  end if;

  select * into v_outbox
  from private.device_command_outbox
  where command_id = p_command_id
  for update;

  if v_outbox.command_id is null then
    return jsonb_build_object('begun',false,'reason','not_found');
  end if;
  if v_outbox.status <> 'leased'
     or v_outbox.lease_token is distinct from p_lease_token
     or v_outbox.fencing_token <> p_fencing_token then
    return jsonb_build_object('begun',false,'reason','stale_lease');
  end if;
  if v_outbox.leased_until <= now() then
    return jsonb_build_object('begun',false,'reason','lease_expired');
  end if;

  select * into v_command
  from public.device_commands
  where id = p_command_id
  for update;

  if v_command.id is null then
    return jsonb_build_object('begun',false,'reason','command_not_found');
  end if;

  select * into v_device
  from public.devices
  where id = v_command.device_id
  for update;

  if v_command.delivery_status <> 'leased' then
    v_reason := 'command_state_changed';
  elsif v_device.id is null then
    v_reason := 'device_not_found';
  elsif v_device.owner_id is distinct from v_command.owner_id
     or v_command.actor_user_id is distinct from v_command.owner_id then
    v_reason := 'owner_changed';
  elsif v_device.robot_lifecycle <> 'owned' then
    v_reason := 'device_not_owned';
  elsif v_device.robot_authorization_epoch <> v_command.authorization_epoch then
    v_reason := 'authorization_epoch_changed';
  elsif v_device.robot_active_boot_id is distinct from v_command.expected_boot_id then
    v_reason := 'boot_changed';
  elsif v_device.robot_authority_version <> v_command.expected_device_version then
    v_reason := 'authority_version_changed';
  elsif v_device.robot_public_key_fingerprint is distinct from v_command.expected_public_key_fingerprint then
    v_reason := 'fingerprint_changed';
  elsif not exists (
    select 1 from public.profiles p
    where p.id = v_command.owner_id and p.account_status = 'active'
  ) then
    v_reason := 'account_inactive';
  elsif not exists (
    select 1 from public.account_terminals t
    where t.id = v_command.terminal_id
      and t.user_id = v_command.owner_id
      and t.auth_session_id = v_command.auth_session_id
      and t.revoked_at is null
  ) then
    v_reason := 'session_or_terminal_inactive';
  elsif now() >= v_command.expires_at then
    v_reason := 'command_expired';
  end if;

  if v_reason is not null then
    update private.device_command_outbox
    set status = 'cancelled',
        lease_token = null,
        leased_until = null,
        last_error_code = left(v_reason,100),
        updated_at = now()
    where command_id = p_command_id
      and status = 'leased'
      and lease_token = p_lease_token
      and fencing_token = p_fencing_token;

    update public.device_commands
    set delivery_status = 'cancelled',
        version = version + 1,
        updated_at = now()
    where id = p_command_id
      and delivery_status = 'leased';

    return jsonb_build_object('begun',false,'reason',v_reason);
  end if;

  update private.device_command_outbox
  set status = 'dispatching',
      updated_at = now()
  where command_id = p_command_id
    and status = 'leased'
    and lease_token = p_lease_token
    and fencing_token = p_fencing_token
    and leased_until > now();
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('begun',false,'reason','stale_lease');
  end if;

  update public.device_commands
  set delivery_status = 'dispatching',
      version = version + 1,
      updated_at = now()
  where id = p_command_id
    and delivery_status = 'leased';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'robot command projection changed during publish begin';
  end if;

  return jsonb_build_object(
    'begun',true,
    'reason','dispatch_authorized',
    'command_id',p_command_id,
    'lease_token',p_lease_token,
    'fencing_token',p_fencing_token,
    'dispatch_deadline',v_outbox.leased_until,
    'delivery_status','dispatching'
  );
end;
$$;

create or replace function public.finish_robot_command_publish(
  p_command_id uuid,
  p_lease_token uuid,
  p_fencing_token bigint,
  p_outcome text,
  p_transport_message_id text default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outbox private.device_command_outbox;
  v_command public.device_commands;
  v_status text;
begin
  if p_outcome not in ('published','transport_failure','delivery_unknown') then
    raise exception 'invalid publish outcome';
  end if;

  select * into v_outbox
  from private.device_command_outbox
  where command_id = p_command_id
  for update;

  if v_outbox.command_id is null
     or v_outbox.status <> 'dispatching'
     or v_outbox.lease_token is distinct from p_lease_token
     or v_outbox.fencing_token <> p_fencing_token
     or v_outbox.leased_until <= now() then
    return jsonb_build_object('applied',false,'reason','stale_dispatch');
  end if;

  select * into v_command
  from public.device_commands
  where id = p_command_id
  for update;

  if v_command.id is null or v_command.delivery_status <> 'dispatching' then
    return jsonb_build_object('applied',false,'reason','stale_dispatch');
  end if;

  if p_outcome = 'published' then
    if p_transport_message_id is null or length(btrim(p_transport_message_id)) not between 3 and 200 then
      raise exception 'transport message id required';
    end if;
    update private.device_command_outbox
    set status = 'published',
        lease_token = null,
        leased_until = null,
        transport_message_id = btrim(p_transport_message_id),
        published_at = now(),
        ack_deadline = now() + interval '30 seconds',
        last_error_code = null,
        updated_at = now()
    where command_id = p_command_id;
    update public.device_commands
    set delivery_status = 'published',version = version + 1,updated_at = now()
    where id = p_command_id;
    return jsonb_build_object('applied',true,'delivery_status','published','ack_status',null);
  elsif p_outcome = 'transport_failure' then
    v_status := case when v_outbox.attempts >= v_outbox.max_attempts then 'dead_letter' else 'queued' end;
    update private.device_command_outbox
    set status = v_status,
        lease_token = null,
        leased_until = null,
        available_at = case
          when v_status = 'queued' then now() + make_interval(secs => least(60,2^attempts)::integer)
          else available_at
        end,
        last_error_code = left(coalesce(p_error_code,'transport_failure'),100),
        updated_at = now()
    where command_id = p_command_id;
    update public.device_commands
    set delivery_status = v_status,version = version + 1,updated_at = now()
    where id = p_command_id;
    return jsonb_build_object('applied',true,'delivery_status',v_status,'ack_status',null);
  else
    update private.device_command_outbox
    set status = 'delivery_unknown',
        lease_token = null,
        leased_until = null,
        last_error_code = left(coalesce(p_error_code,'publish_outcome_unknown'),100),
        updated_at = now()
    where command_id = p_command_id;
    update public.device_commands
    set delivery_status = 'delivery_unknown',version = version + 1,updated_at = now()
    where id = p_command_id;
    return jsonb_build_object('applied',true,'delivery_status','delivery_unknown','ack_status',null);
  end if;
end;
$$;

create or replace function public.reconcile_robot_command_timeouts(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_row record;
  v_status text;
  v_error text;
begin
  if p_limit not between 1 and 1000 then
    raise exception 'invalid reconcile limit';
  end if;

  for v_row in
    select * from private.device_command_outbox
    where (status in ('leased','dispatching') and leased_until <= now())
       or (status = 'published' and ack_deadline <= now())
    order by updated_at
    for update skip locked
    limit p_limit
  loop
    if v_row.status = 'leased' then
      v_status := case when v_row.attempts >= v_row.max_attempts then 'dead_letter' else 'queued' end;
      v_error := 'lease_expired';
    elsif v_row.status = 'dispatching' then
      v_status := 'delivery_unknown';
      v_error := 'dispatch_timeout_unknown';
    else
      v_status := 'delivery_unknown';
      v_error := 'ack_timeout_unknown';
    end if;

    update private.device_command_outbox
    set status = v_status,
        lease_token = null,
        leased_until = null,
        available_at = case when v_status = 'queued' then now() + interval '1 second' else available_at end,
        last_error_code = v_error,
        updated_at = now()
    where command_id = v_row.command_id;

    update public.device_commands
    set delivery_status = v_status,version = version + 1,updated_at = now()
    where id = v_row.command_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.begin_robot_command_publish(uuid,uuid,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.begin_robot_command_publish(uuid,uuid,bigint)
  to service_role;

revoke all on function public.finish_robot_command_publish(uuid,uuid,bigint,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.finish_robot_command_publish(uuid,uuid,bigint,text,text,text)
  to service_role;

revoke all on function public.reconcile_robot_command_timeouts(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.reconcile_robot_command_timeouts(integer)
  to service_role;

revoke all on function private.cancel_robot_commands_for_authority_change()
  from public,anon,authenticated,service_role;

comment on function public.begin_robot_command_publish(uuid,uuid,bigint) is
  'Service-role CAS boundary. A worker must receive begun=true before initiating transport I/O.';
comment on function public.finish_robot_command_publish(uuid,uuid,bigint,text,text,text) is
  'Settles only a matching dispatching lease. Ambiguous dispatch is terminal delivery_unknown.';
