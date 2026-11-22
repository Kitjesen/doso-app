-- Private object bytes live in OSS. The catalog exposes no storage capabilities.
create table public.device_map_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete restrict,
  authorization_epoch bigint not null check (authorization_epoch >= 1),
  request_id uuid not null,
  name text not null check (length(name) between 1 and 200 and name = btrim(name) and name !~ '[\x01-\x1f\x7f]'),
  source_map_id text not null check (length(source_map_id) between 1 and 200 and source_map_id = btrim(source_map_id) and source_map_id !~ '[\x01-\x1f\x7f]'),
  source_content_epoch text not null check (source_content_epoch ~ '^[0-9]{1,20}$'),
  frame_id text check (frame_id is null or (length(frame_id) between 1 and 200 and frame_id = btrim(frame_id) and frame_id !~ '[\x01-\x1f\x7f]')),
  format text not null check (format = 'lingtu-map-package-v1'),
  schema_version integer not null check (schema_version >= 1),
  archive_format text not null check (archive_format = 'tar.gz'),
  size_bytes bigint not null check (size_bytes between 1 and 21474836480),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  crc64 text not null check (crc64 ~ '^(0|[1-9][0-9]{0,19})$' and crc64::numeric <= 18446744073709551615),
  status text not null default 'uploading' check (status in ('uploading','verifying','ready','failed','cancelled')),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique(owner_id,request_id),
  check ((status = 'ready') = (ready_at is not null))
);

create index device_map_versions_owner_created_idx on public.device_map_versions(owner_id,created_at desc,id);

create table private.device_map_uploads (
  version_id uuid primary key references public.device_map_versions(id) on delete cascade,
  object_key text not null unique,
  upload_id text check (upload_id is null or length(upload_id) between 1 and 2048)
);

alter table public.device_map_versions enable row level security;
revoke all on public.device_map_versions from public,anon,authenticated,service_role;
revoke all on private.device_map_uploads from public,anon,authenticated,service_role;
grant select on public.device_map_versions to authenticated;
create policy device_map_versions_select_owner on public.device_map_versions
for select to authenticated using (
  owner_id = (select auth.uid())
  and (select private.is_account_active())
  and (select private.is_session_active())
);

-- Source-dependent operations lock the device before the version, matching owner changes.
create function private.lock_map_version(p_owner_id uuid,p_version_id uuid,p_require_source boolean)
returns public.device_map_versions language plpgsql security definer set search_path = '' as $$
declare
  v_map public.device_map_versions;
  v_device public.devices;
begin
  if p_owner_id is null or not coalesce(private.is_account_active_for(p_owner_id),false) then
    raise exception using errcode='42501',message='map_access_denied';
  end if;
  select * into v_map from public.device_map_versions where id=p_version_id and owner_id=p_owner_id;
  if v_map.id is null then raise exception using errcode='42501',message='map_access_denied'; end if;
  if p_require_source then
    select * into v_device from public.devices where id=v_map.device_id for update;
    if v_device.id is null or v_device.owner_id is distinct from p_owner_id or v_device.is_demo
       or v_device.robot_authorization_epoch is distinct from v_map.authorization_epoch then
      raise exception using errcode='55000',message='map_source_authority_changed';
    end if;
  end if;
  select * into v_map from public.device_map_versions where id=p_version_id and owner_id=p_owner_id for update;
  if v_map.id is null then raise exception using errcode='42501',message='map_access_denied'; end if;
  return v_map;
end;
$$;

create function private.map_version_result(p_version_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select to_jsonb(v) || jsonb_build_object('object_key',u.object_key,'upload_id',u.upload_id)
  from public.device_map_versions v join private.device_map_uploads u on u.version_id=v.id
  where v.id=p_version_id;
$$;

create function public.prepare_map_version(p_owner_id uuid,p_device_id uuid,p_request_id uuid,p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_device public.devices;
  v_map public.device_map_versions;
  v_metadata jsonb;
begin
  if p_owner_id is null or not coalesce(private.is_account_active_for(p_owner_id),false) then
    raise exception using errcode='42501',message='map_access_denied';
  end if;
  select * into v_device from public.devices where id=p_device_id for update;
  if v_device.id is null or v_device.owner_id is distinct from p_owner_id or v_device.is_demo then
    raise exception using errcode='42501',message='map_access_denied';
  end if;
  if p_request_id is null or p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
     or p_metadata - array['name','source_map_id','source_content_epoch','frame_id','format','schema_version','archive_format','size_bytes','sha256','crc64'] <> '{}'::jsonb
     or not (p_metadata ?& array['name','source_map_id','source_content_epoch','format','schema_version','archive_format','size_bytes','sha256','crc64'])
     or jsonb_typeof(p_metadata->'name') <> 'string'
     or jsonb_typeof(p_metadata->'source_map_id') <> 'string'
     or jsonb_typeof(p_metadata->'source_content_epoch') <> 'string'
     or jsonb_typeof(p_metadata->'format') <> 'string'
     or jsonb_typeof(p_metadata->'archive_format') <> 'string'
     or jsonb_typeof(p_metadata->'sha256') <> 'string'
     or jsonb_typeof(p_metadata->'crc64') <> 'string'
     or jsonb_typeof(p_metadata->'schema_version') <> 'number'
     or jsonb_typeof(p_metadata->'size_bytes') <> 'number'
     or (p_metadata ? 'frame_id' and jsonb_typeof(p_metadata->'frame_id') not in ('string','null')) then
    raise exception using errcode='22023',message='map_invalid_metadata';
  end if;
  begin
    select * into v_map from jsonb_populate_record(null::public.device_map_versions,p_metadata);
    if v_map.name is null or length(v_map.name) not between 1 and 200 or v_map.name <> btrim(v_map.name) or v_map.name ~ '[\x01-\x1f\x7f]'
       or v_map.source_map_id is null or length(v_map.source_map_id) not between 1 and 200 or v_map.source_map_id <> btrim(v_map.source_map_id) or v_map.source_map_id ~ '[\x01-\x1f\x7f]'
       or v_map.source_content_epoch is null or v_map.source_content_epoch !~ '^[0-9]{1,20}$'
       or (v_map.frame_id is not null and (length(v_map.frame_id) not between 1 and 200 or v_map.frame_id <> btrim(v_map.frame_id) or v_map.frame_id ~ '[\x01-\x1f\x7f]'))
       or v_map.format is distinct from 'lingtu-map-package-v1' or v_map.archive_format is distinct from 'tar.gz'
       or v_map.schema_version is null or v_map.schema_version < 1
       or v_map.size_bytes is null or v_map.size_bytes not between 1 and 21474836480
       or v_map.sha256 is null or v_map.sha256 !~ '^[0-9a-f]{64}$'
       or v_map.crc64 is null or v_map.crc64 !~ '^(0|[1-9][0-9]{0,19})$' or v_map.crc64::numeric > 18446744073709551615 then
      raise exception using errcode='22023',message='map_invalid_metadata';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode='22023',message='map_invalid_metadata';
  end;
  v_metadata := jsonb_build_object('name',v_map.name,'source_map_id',v_map.source_map_id,
    'source_content_epoch',v_map.source_content_epoch,'frame_id',v_map.frame_id,'format',v_map.format,
    'schema_version',v_map.schema_version,'archive_format',v_map.archive_format,
    'size_bytes',v_map.size_bytes,'sha256',v_map.sha256,'crc64',v_map.crc64);
  select * into v_map from public.device_map_versions where owner_id=p_owner_id and request_id=p_request_id for update;
  if v_map.id is not null then
    if v_map.device_id <> p_device_id or v_map.authorization_epoch <> v_device.robot_authorization_epoch
       or (to_jsonb(v_map) - array['id','owner_id','device_id','authorization_epoch','request_id','status','created_at','ready_at']) <> v_metadata then
      raise exception using errcode='22023',message='map_idempotency_conflict';
    end if;
    return private.map_version_result(v_map.id);
  end if;
  insert into public.device_map_versions(owner_id,device_id,authorization_epoch,request_id,name,source_map_id,
    source_content_epoch,frame_id,format,schema_version,archive_format,size_bytes,sha256,crc64)
  values(p_owner_id,p_device_id,v_device.robot_authorization_epoch,p_request_id,v_metadata->>'name',v_metadata->>'source_map_id',
    v_metadata->>'source_content_epoch',v_metadata->>'frame_id',v_metadata->>'format',(v_metadata->>'schema_version')::integer,
    v_metadata->>'archive_format',(v_metadata->>'size_bytes')::bigint,v_metadata->>'sha256',v_metadata->>'crc64') returning * into v_map;
  insert into private.device_map_uploads(version_id,object_key)
    values(v_map.id,'maps/' || p_owner_id::text || '/' || v_map.id::text || '.tar.gz');
  return private.map_version_result(v_map.id);
end;
$$;

create function public.get_map_version_for_transfer(p_owner_id uuid,p_version_id uuid,p_require_source boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_map_version(p_owner_id,p_version_id,coalesce(p_require_source,true));
  return private.map_version_result(p_version_id);
end;
$$;

create function public.set_map_upload_id(p_owner_id uuid,p_version_id uuid,p_upload_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_map public.device_map_versions; v_upload_id text;
begin
  v_map := private.lock_map_version(p_owner_id,p_version_id,true);
  if v_map.status <> 'uploading' then raise exception using errcode='55000',message='map_state_conflict'; end if;
  if p_upload_id is null or length(p_upload_id) not between 1 and 2048 then
    raise exception using errcode='22023',message='map_invalid_upload_id';
  end if;
  select upload_id into v_upload_id from private.device_map_uploads where version_id=p_version_id;
  if v_upload_id is not null then
    return private.map_version_result(p_version_id);
  end if;
  update private.device_map_uploads set upload_id=p_upload_id where version_id=p_version_id;
  return private.map_version_result(p_version_id);
end;
$$;

create function public.begin_map_verification(p_owner_id uuid,p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_map public.device_map_versions;
begin
  v_map := private.lock_map_version(p_owner_id,p_version_id,true);
  if v_map.status not in ('uploading','verifying')
     or not exists(select 1 from private.device_map_uploads where version_id=p_version_id and upload_id is not null) then
    raise exception using errcode='55000',message='map_state_conflict';
  end if;
  update public.device_map_versions set status='verifying' where id=p_version_id;
  return private.map_version_result(p_version_id);
end;
$$;

-- OSS size and CRC64 attest stored bytes. SHA256/package validation is performed before robot import.
create function public.finish_map_verification(p_owner_id uuid,p_version_id uuid,p_size_bytes bigint,p_crc64 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_map public.device_map_versions;
begin
  v_map := private.lock_map_version(p_owner_id,p_version_id,true);
  if v_map.status not in ('verifying','ready') then raise exception using errcode='55000',message='map_state_conflict'; end if;
  if p_size_bytes is distinct from v_map.size_bytes or p_crc64 is distinct from v_map.crc64 then
    if v_map.status = 'ready' then raise exception using errcode='55000',message='map_verification_mismatch'; end if;
    update public.device_map_versions set status='failed' where id=p_version_id;
    return private.map_version_result(p_version_id);
  end if;
  if v_map.status = 'verifying' then
    update public.device_map_versions set status='ready',ready_at=now() where id=p_version_id;
  end if;
  return private.map_version_result(p_version_id);
end;
$$;

create function public.cancel_map_version(p_owner_id uuid,p_version_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_map public.device_map_versions;
begin
  -- The creating owner can revoke an unfinished upload after unbinding the source.
  v_map := private.lock_map_version(p_owner_id,p_version_id,false);
  if v_map.status = 'ready' then raise exception using errcode='55000',message='map_state_conflict'; end if;
  update public.device_map_versions set status='cancelled' where id=p_version_id;
  return private.map_version_result(p_version_id);
end;
$$;

revoke all on function private.lock_map_version(uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function private.map_version_result(uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_map_version(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.get_map_version_for_transfer(uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.set_map_upload_id(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.begin_map_verification(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.finish_map_verification(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.cancel_map_version(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_map_version(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.get_map_version_for_transfer(uuid,uuid,boolean) to service_role;
grant execute on function public.set_map_upload_id(uuid,uuid,text) to service_role;
grant execute on function public.begin_map_verification(uuid,uuid) to service_role;
grant execute on function public.finish_map_verification(uuid,uuid,bigint,text) to service_role;
grant execute on function public.cancel_map_version(uuid,uuid) to service_role;

comment on column public.device_map_versions.sha256 is 'Source-declared archive SHA256. A receiving robot must verify it before extraction/import.';
comment on column public.device_map_versions.crc64 is 'Expected whole-object CRC64 decimal. ready requires trusted OSS-reported size and CRC64 to match.';
