create table private.telemetry_devices (
  device_id uuid not null references public.devices(id) on delete cascade,
  authorization_epoch bigint not null check (authorization_epoch between 1 and 9007199254740991),
  owner_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  tb_device_id uuid unique,
  dropped_count bigint not null default 0,
  primary key(device_id,authorization_epoch)
);

create table private.telemetry_outbox (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  authorization_epoch bigint not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  consent_version bigint not null,
  session_id uuid not null,
  seq bigint not null,
  received jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  state text not null default 'pending' check(state in ('pending','delivered','cancelled','failed','conflict')),
  attempts integer not null default 0,
  available_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  foreign key(device_id,authorization_epoch) references private.telemetry_devices on delete cascade,
  unique(device_id,authorization_epoch,consent_version,session_id,seq)
);
create index telemetry_outbox_pending on private.telemetry_outbox(available_at,created_at) where state='pending';
create index telemetry_outbox_device on private.telemetry_outbox(device_id,authorization_epoch,state);
revoke all on private.telemetry_devices,private.telemetry_outbox from public,anon,authenticated,service_role;

create function private.telemetry_allowed(p_item private.telemetry_outbox)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.devices d
    join private.device_remote_state s on s.device_id=d.id
    join private.telemetry_devices m on m.device_id=d.id and m.authorization_epoch=d.robot_authorization_epoch
    where d.id=p_item.device_id and not d.is_demo and d.owner_id=p_item.owner_id
      and d.robot_authorization_epoch=p_item.authorization_epoch
      and s.owner_id=p_item.owner_id and s.authorization_epoch=p_item.authorization_epoch
      and s.enabled and s.revision=p_item.consent_version
      and m.enabled and m.owner_id=p_item.owner_id
      and coalesce(private.is_account_active_for(d.owner_id),false));
$$;

create function private.enqueue_telemetry()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_mapping private.telemetry_devices; v_report jsonb;
begin
  if tg_op='DELETE' then
    update private.telemetry_outbox set state='cancelled',lease_token=null,lease_until=null
    where device_id=old.device_id and state='pending';
    return old;
  end if;
  if not new.enabled or new.revision<>old.revision or new.owner_id is distinct from old.owner_id
     or new.authorization_epoch<>old.authorization_epoch then
    update private.telemetry_outbox set state='cancelled',lease_token=null,lease_until=null
    where device_id=new.device_id and state='pending';
    return new;
  end if;
  if new.latest is null or new.latest is not distinct from old.latest or new.last_seq<=old.last_seq then return new; end if;
  v_report := new.latest->'report';
  if v_report->>'authorizationEpoch'<>new.authorization_epoch::text
     or v_report->>'consentVersion'<>new.revision::text
     or v_report->>'reportingSessionId'<>new.session_id::text
     or v_report->>'connectionId'<>new.connection_id::text
     or v_report->>'seq'<>new.last_seq::text or new.last_seq<=0 then return new; end if;
  select * into v_mapping from private.telemetry_devices
  where device_id=new.device_id and authorization_epoch=new.authorization_epoch for update;
  if not found or not v_mapping.enabled or v_mapping.owner_id is distinct from new.owner_id then return new; end if;
  -- Keep delivery metadata bounded; history itself belongs to ThingsBoard.
  delete from private.telemetry_outbox where id in (select id from private.telemetry_outbox
    where device_id=new.device_id and state<>'pending' and created_at<clock_timestamp()-interval '1 day' limit 100);
  update private.telemetry_outbox set state='failed',lease_token=null,lease_until=null
    where device_id=new.device_id and state='pending' and created_at<clock_timestamp()-interval '1 day';
  if (select count(*) from private.telemetry_outbox where device_id=new.device_id and state='pending')>=10000 then
    update private.telemetry_devices set dropped_count=dropped_count+1
      where device_id=new.device_id and authorization_epoch=new.authorization_epoch;
    return new;
  end if;
  insert into private.telemetry_outbox(device_id,authorization_epoch,owner_id,consent_version,session_id,seq,received)
    values(new.device_id,new.authorization_epoch,new.owner_id,new.revision,new.session_id,new.last_seq,new.latest)
    on conflict(device_id,authorization_epoch,consent_version,session_id,seq) do nothing;
  return new;
end;
$$;
create trigger remote_state_telemetry after update of latest,enabled,revision,owner_id,authorization_epoch or delete
on private.device_remote_state for each row execute function private.enqueue_telemetry();

create function public.configure_telemetry_export(p_device_id uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.devices; v_mapping private.telemetry_devices;
begin
  if p_enabled is null then raise exception using errcode='22023',message='invalid_telemetry_export'; end if;
  select * into v_device from public.devices where id=p_device_id and not is_demo for update;
  if not found then raise exception using errcode='42501',message='telemetry_export_denied'; end if;
  if not p_enabled then
    update private.telemetry_devices set enabled=false where device_id=p_device_id;
    update private.telemetry_outbox set state='cancelled',lease_token=null,lease_until=null
      where device_id=p_device_id and state='pending';
    return jsonb_build_object('deviceId',v_device.id,'authorizationEpoch',v_device.robot_authorization_epoch,'enabled',false);
  end if;
  if v_device.owner_id is null or not coalesce(private.is_account_active_for(v_device.owner_id),false) then
    raise exception using errcode='42501',message='telemetry_export_denied';
  end if;
  insert into private.telemetry_devices(device_id,authorization_epoch,owner_id,enabled)
    values(v_device.id,v_device.robot_authorization_epoch,v_device.owner_id,p_enabled)
    on conflict(device_id,authorization_epoch) do update set enabled=excluded.enabled
    returning * into v_mapping;
  return jsonb_build_object('deviceId',v_mapping.device_id,'authorizationEpoch',v_mapping.authorization_epoch,
    'enabled',v_mapping.enabled,'tbDeviceId',v_mapping.tb_device_id,'droppedCount',v_mapping.dropped_count);
end;
$$;

create function public.claim_telemetry_export()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item private.telemetry_outbox; v_mapping private.telemetry_devices; v_simulated boolean;
begin
  -- At most one outstanding delivery per device; parallel workers skip busy devices.
  for v_mapping in select m.* from private.telemetry_devices m where enabled
    order by (select min(o.created_at) from private.telemetry_outbox o where o.device_id=m.device_id
      and o.authorization_epoch=m.authorization_epoch and o.state='pending' and o.available_at<=clock_timestamp()),device_id,authorization_epoch
    for update skip locked loop
    update private.telemetry_outbox o set state=case when private.telemetry_allowed(o) then 'failed' else 'cancelled' end,
      lease_token=null,lease_until=null
      where o.device_id=v_mapping.device_id and o.authorization_epoch=v_mapping.authorization_epoch and o.state='pending'
        and (not private.telemetry_allowed(o) or o.created_at<clock_timestamp()-interval '1 day' or o.attempts>=20)
        and (o.lease_until is null or o.lease_until<=clock_timestamp());
    if exists(select 1 from private.telemetry_outbox where device_id=v_mapping.device_id
      and authorization_epoch=v_mapping.authorization_epoch and state='pending' and lease_until>clock_timestamp()) then continue; end if;
    select * into v_item from private.telemetry_outbox where device_id=v_mapping.device_id
      and authorization_epoch=v_mapping.authorization_epoch and state='pending' and available_at<=clock_timestamp()
      order by created_at,id limit 1 for update skip locked;
    if not found then continue; end if;
    update private.telemetry_outbox set attempts=attempts+1,lease_token=gen_random_uuid(),
      lease_until=clock_timestamp()+interval '120 seconds' where id=v_item.id returning * into v_item;
    select is_simulated into v_simulated from public.devices where id=v_item.device_id;
    return jsonb_build_object('v',1,'items',jsonb_build_array(jsonb_build_object(
      'id',v_item.id,'leaseToken',v_item.lease_token,'deviceId',v_item.device_id,'ownerId',v_item.owner_id,
      'authorizationEpoch',v_item.authorization_epoch,'consentVersion',v_item.consent_version,
      'tbDeviceId',v_mapping.tb_device_id,'simulated',v_simulated,'received',v_item.received)));
  end loop;
  return jsonb_build_object('v',1,'items','[]'::jsonb);
end;
$$;

create function public.check_telemetry_export(p_id uuid,p_lease_token uuid,p_tb_device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item private.telemetry_outbox; v_mapping private.telemetry_devices;
begin
  select * into v_item from private.telemetry_outbox where id=p_id;
  if not found then return jsonb_build_object('v',1,'allowed',false); end if;
  -- Match the device -> state -> mapping lock order used by state synchronization.
  perform 1 from public.devices where id=v_item.device_id for update;
  perform 1 from private.device_remote_state where device_id=v_item.device_id for update;
  select * into v_mapping from private.telemetry_devices where device_id=v_item.device_id
    and authorization_epoch=v_item.authorization_epoch for update;
  select * into v_item from private.telemetry_outbox where id=p_id for update;
  if not found or v_item.state<>'pending' or v_item.lease_token is distinct from p_lease_token
     or v_item.lease_until<=clock_timestamp() then return jsonb_build_object('v',1,'allowed',false); end if;
  if not private.telemetry_allowed(v_item) then
    update private.telemetry_outbox set state='cancelled',lease_token=null,lease_until=null where id=p_id;
    return jsonb_build_object('v',1,'allowed',false);
  end if;
  if p_tb_device_id is not null then
    if v_mapping.tb_device_id is not null and v_mapping.tb_device_id<>p_tb_device_id then
      return jsonb_build_object('v',1,'allowed',false);
    end if;
    update private.telemetry_devices set tb_device_id=p_tb_device_id where device_id=v_item.device_id
      and authorization_epoch=v_item.authorization_epoch;
  end if;
  return jsonb_build_object('v',1,'allowed',true);
end;
$$;

create function public.finish_telemetry_export(p_id uuid,p_lease_token uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item private.telemetry_outbox;
begin
  if p_outcome is null or p_outcome not in ('delivered','retry','conflict') then
    raise exception using errcode='22023',message='invalid_telemetry_export';
  end if;
  select * into v_item from private.telemetry_outbox where id=p_id for update;
  if not found or v_item.state<>'pending' or v_item.lease_token is distinct from p_lease_token
     or v_item.lease_until<=clock_timestamp() then return jsonb_build_object('v',1,'accepted',false); end if;
  update private.telemetry_outbox set state=case when not private.telemetry_allowed(v_item) then 'cancelled'
      when p_outcome='retry' then case when attempts>=20 then 'failed' else 'pending' end else p_outcome end,
    available_at=clock_timestamp()+make_interval(secs=>least(300,power(2,least(attempts,8))::integer)),
    lease_token=null,lease_until=null where id=p_id;
  return jsonb_build_object('v',1,'accepted',true);
end;
$$;

revoke all on function private.telemetry_allowed(private.telemetry_outbox) from public,anon,authenticated,service_role;
revoke all on function private.enqueue_telemetry() from public,anon,authenticated,service_role;
revoke all on function public.configure_telemetry_export(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.claim_telemetry_export() from public,anon,authenticated,service_role;
revoke all on function public.check_telemetry_export(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.finish_telemetry_export(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.configure_telemetry_export(uuid,boolean) to service_role;
grant execute on function public.claim_telemetry_export() to service_role;
grant execute on function public.check_telemetry_export(uuid,uuid,uuid) to service_role;
grant execute on function public.finish_telemetry_export(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
