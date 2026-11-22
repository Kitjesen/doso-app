-- Local candidate. Viewing permission does not enable cloud connection or camera capture.
create table private.video_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid not null references auth.sessions(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  authorization_epoch bigint not null,
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  primary key (user_id,auth_session_id,device_id)
);
revoke all on private.video_grants from public,anon,authenticated,service_role;

create function public.open_video_access(p_device_id uuid,p_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.devices; v_expires timestamptz;
begin
  if auth.uid() is null or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='video_access_denied';
  end if;
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_video_digest';
  end if;
  select * into v_device from public.devices where id=p_device_id for update;
  if v_device.id is null or v_device.owner_id is distinct from auth.uid() or v_device.is_demo
     or coalesce(to_jsonb(v_device)->>'robot_lifecycle','owned') <> 'owned'
     or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='video_access_denied';
  end if;
  v_expires := clock_timestamp()+interval '60 seconds';
  delete from private.video_grants where user_id=auth.uid() and expires_at<=clock_timestamp();
  insert into private.video_grants(user_id,auth_session_id,device_id,authorization_epoch,token_digest,expires_at)
  values(auth.uid(),private.current_session_id(),v_device.id,v_device.robot_authorization_epoch,p_digest,v_expires)
  on conflict(user_id,auth_session_id,device_id) do update
    set authorization_epoch=excluded.authorization_epoch,token_digest=excluded.token_digest,expires_at=excluded.expires_at;
  return jsonb_build_object('viewerId',auth.uid(),'deviceId',v_device.id,
    'expiresAt',floor(extract(epoch from v_expires)*1000)::bigint);
end;
$$;

create function public.close_video_access(p_device_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.is_account_active() or not private.is_session_active() then
    raise exception using errcode='42501',message='video_access_denied';
  end if;
  delete from private.video_grants where user_id=auth.uid()
    and auth_session_id=private.current_session_id() and device_id=p_device_id;
end;
$$;

create function public.authorize_video_access(p_digest text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('viewerId',grants.user_id,'deviceId',grants.device_id,
    'expiresAt',floor(extract(epoch from grants.expires_at)*1000)::bigint)
  from private.video_grants as grants
  join public.devices as devices on devices.id=grants.device_id
  join auth.sessions as sessions on sessions.id=grants.auth_session_id and sessions.user_id=grants.user_id
  where grants.token_digest=p_digest and grants.expires_at>statement_timestamp()
    -- Minimal status deployments omit the command lifecycle column.
    and devices.owner_id=grants.user_id and not devices.is_demo
    and coalesce(to_jsonb(devices)->>'robot_lifecycle','owned')='owned'
    and devices.robot_authorization_epoch=grants.authorization_epoch
    and private.is_account_active_for(grants.user_id)
    and exists(select 1 from public.account_terminals as terminals
      where terminals.user_id=grants.user_id and terminals.auth_session_id=grants.auth_session_id
        and terminals.revoked_at is null);
$$;
revoke all on function public.open_video_access(uuid,text),public.close_video_access(uuid),public.authorize_video_access(text)
  from public,anon,authenticated,service_role;
grant execute on function public.open_video_access(uuid,text),public.close_video_access(uuid) to authenticated;
grant execute on function public.authorize_video_access(text) to service_role;
