create table private.robot_manufacturing_identities (
  device_id uuid primary key references public.devices(id) on delete cascade,
  public_key_pem text not null check (length(public_key_pem) between 64 and 8192),
  public_key_fingerprint text not null unique check (public_key_fingerprint ~ '^[0-9a-f]{64}$'),
  factory_reset_counter bigint not null check (factory_reset_counter between 0 and 9007199254740991),
  last_reset_proof_digest text check (last_reset_proof_digest is null or last_reset_proof_digest ~ '^[0-9a-f]{64}$'),
  reset_counter_updated_at timestamptz,
  status text not null default 'active' check (status in ('active','revoked')),
  registered_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  check (
    (status = 'active' and revoked_at is null and revocation_reason is null)
    or (status = 'revoked' and revoked_at is not null and length(btrim(revocation_reason)) between 3 and 160)
  )
);

create table private.robot_enrollment_sessions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique default gen_random_uuid(),
  nonce_b64url text not null unique check (nonce_b64url ~ '^[A-Za-z0-9_-]{43}$'),
  device_id uuid not null references public.devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  terminal_id uuid not null references public.account_terminals(id) on delete restrict,
  auth_session_id uuid not null,
  authority_version bigint not null check (authority_version >= 1),
  authorization_epoch bigint not null check (authorization_epoch >= 1),
  factory_reset_counter bigint not null check (factory_reset_counter between 0 and 9007199254740991),
  device_event_sequence bigint not null default 0 check (device_event_sequence between 0 and 9007199254740991),
  phase text not null default 'challenge_issued'
    check (phase in ('challenge_issued','identity_verified','completed','expired','invalidated')),
  version bigint not null default 1 check (version >= 1),
  identity_proof_digest text check (identity_proof_digest is null or identity_proof_digest ~ '^[0-9a-f]{64}$'),
  completion_digest text check (completion_digest is null or completion_digest ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  identity_verified_at timestamptz,
  completed_at timestamptz,
  invalidation_reason text,
  updated_at timestamptz not null default now(),
  check (expires_at > issued_at),
  check (
    (phase = 'challenge_issued' and identity_verified_at is null and completed_at is null)
    or (phase = 'identity_verified' and identity_verified_at is not null and completed_at is null)
    or (phase = 'completed' and identity_verified_at is not null and completed_at is not null)
    or phase in ('expired','invalidated')
  )
);

create unique index robot_enrollment_one_active_per_device_idx
  on private.robot_enrollment_sessions(device_id)
  where phase in ('challenge_issued','identity_verified');

create index robot_enrollment_owner_created_idx
  on private.robot_enrollment_sessions(owner_id,issued_at desc);

alter table private.robot_manufacturing_identities enable row level security;
alter table private.robot_enrollment_sessions enable row level security;

revoke all on table private.robot_manufacturing_identities from public,anon,authenticated,service_role;
revoke all on table private.robot_enrollment_sessions from public,anon,authenticated,service_role;

create function public.register_robot_manufacturing_identity(
  p_device_id uuid,
  p_public_key_pem text,
  p_public_key_fingerprint text,
  p_factory_reset_counter bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices;
  v_existing private.robot_manufacturing_identities;
  v_der bytea;
  v_b64 text;
  v_computed_fingerprint text;
begin
  if p_device_id is null
     or p_public_key_pem is null
     or p_public_key_fingerprint is null
     or p_factory_reset_counter is null
     or p_factory_reset_counter < 0
     or p_factory_reset_counter > 9007199254740991
     or p_public_key_fingerprint !~ '^[0-9a-f]{64}$'
     or p_public_key_pem !~ '^-----BEGIN PUBLIC KEY-----[[:space:]]+[A-Za-z0-9+/=[:space:]]+[[:space:]]+-----END PUBLIC KEY-----[[:space:]]*$' then
    raise exception 'invalid robot manufacturing identity input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_device_id::text,0)
  );

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
    raise exception 'robot manufacturing public key fingerprint mismatch';
  end if;

  select * into v_device from public.devices where id=p_device_id for update;
  if v_device.id is null or v_device.is_demo or v_device.serial_number is null then
    raise exception 'physical robot device is required';
  end if;

  select * into v_existing
  from private.robot_manufacturing_identities
  where device_id=p_device_id
  for update;

  if v_existing.device_id is not null then
    if v_existing.status='active'
       and v_existing.public_key_pem=p_public_key_pem
       and v_existing.public_key_fingerprint=p_public_key_fingerprint
       and v_existing.factory_reset_counter=p_factory_reset_counter then
      return jsonb_build_object(
        'device_id',v_existing.device_id,
        'public_key_fingerprint',v_existing.public_key_fingerprint,
        'factory_reset_counter',v_existing.factory_reset_counter,
        'status',v_existing.status,
        'idempotent',true
      );
    end if;
    raise exception 'robot manufacturing identity is immutable';
  end if;

  insert into private.robot_manufacturing_identities(
    device_id,public_key_pem,public_key_fingerprint,factory_reset_counter
  ) values (
    p_device_id,p_public_key_pem,p_public_key_fingerprint,p_factory_reset_counter
  ) returning * into v_existing;

  insert into public.audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,metadata)
  values(null,v_device.owner_id,'robot.manufacturing_identity_registered','device',p_device_id::text,
    jsonb_build_object(
      'publicKeyFingerprint',p_public_key_fingerprint,
      'factoryResetCounter',p_factory_reset_counter
    ));

  return jsonb_build_object(
    'device_id',v_existing.device_id,
    'public_key_fingerprint',v_existing.public_key_fingerprint,
    'factory_reset_counter',v_existing.factory_reset_counter,
    'status',v_existing.status,
    'idempotent',false
  );
end;
$$;

create function public.begin_robot_device_enrollment(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices;
  v_identity private.robot_manufacturing_identities;
  v_terminal public.account_terminals;
  v_session private.robot_enrollment_sessions;
  v_nonce text;
begin
  if p_user_id is null or p_auth_session_id is null or p_device_id is null then
    raise exception 'invalid robot enrollment request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_device_id::text,0)
  );

  if not private.is_account_active_for(p_user_id) then
    raise exception 'active account is required';
  end if;

  select * into v_terminal
  from public.account_terminals
  where user_id=p_user_id
    and auth_session_id=p_auth_session_id
    and revoked_at is null
  for update;
  if v_terminal.id is null then
    raise exception 'active terminal session is required';
  end if;

  select * into v_device from public.devices where id=p_device_id for update;
  if v_device.id is null
     or v_device.owner_id is distinct from p_user_id
     or v_device.is_demo
     or v_device.robot_lifecycle <> 'owned' then
    raise exception 'owned physical robot is required';
  end if;

  select * into v_identity
  from private.robot_manufacturing_identities
  where device_id=p_device_id and status='active'
  for update;
  if v_identity.device_id is null then
    raise exception 'active robot manufacturing identity is required';
  end if;

  update private.robot_enrollment_sessions
  set phase='expired',version=version+1,invalidation_reason='challenge_expired',updated_at=now()
  where device_id=p_device_id
    and phase in ('challenge_issued','identity_verified')
    and expires_at <= now();

  select * into v_session
  from private.robot_enrollment_sessions
  where device_id=p_device_id
    and owner_id=p_user_id
    and terminal_id=v_terminal.id
    and auth_session_id=p_auth_session_id
    and authority_version=v_device.robot_authority_version
    and authorization_epoch=v_device.robot_authorization_epoch
    and factory_reset_counter=v_identity.factory_reset_counter
    and phase in ('challenge_issued','identity_verified')
    and expires_at > now()
  for update;

  if v_session.id is not null then
    return jsonb_build_object(
      'enrollment_id',v_session.id,
      'challenge_id',v_session.challenge_id,
      'nonce_b64url',v_session.nonce_b64url,
      'device_id',v_session.device_id,
      'owner_account_id',v_session.owner_id,
      'terminal_id',v_session.terminal_id,
      'auth_session_id',v_session.auth_session_id,
      'authority_version',v_session.authority_version,
      'authorization_epoch',v_session.authorization_epoch,
      'factory_reset_counter',v_session.factory_reset_counter,
      'device_event_sequence',v_session.device_event_sequence,
      'phase',v_session.phase,
      'version',v_session.version,
      'issued_at_ms',floor(extract(epoch from v_session.issued_at)*1000)::bigint,
      'expires_at_ms',floor(extract(epoch from v_session.expires_at)*1000)::bigint,
      'reused',true
    );
  end if;

  update private.robot_enrollment_sessions
  set phase='invalidated',version=version+1,invalidation_reason='superseded',updated_at=now()
  where device_id=p_device_id
    and phase in ('challenge_issued','identity_verified');

  v_nonce := rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
  insert into private.robot_enrollment_sessions(
    nonce_b64url,device_id,owner_id,terminal_id,auth_session_id,
    authority_version,authorization_epoch,factory_reset_counter
  ) values (
    v_nonce,p_device_id,p_user_id,v_terminal.id,p_auth_session_id,
    v_device.robot_authority_version,v_device.robot_authorization_epoch,v_identity.factory_reset_counter
  ) returning * into v_session;

  insert into public.audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,metadata)
  values(p_user_id,p_user_id,'robot.enrollment_challenge_issued','device',p_device_id::text,
    jsonb_build_object(
      'enrollmentId',v_session.id,
      'challengeId',v_session.challenge_id,
      'terminalId',v_session.terminal_id,
      'authorizationEpoch',v_session.authorization_epoch,
      'factoryResetCounter',v_session.factory_reset_counter
    ));

  return jsonb_build_object(
    'enrollment_id',v_session.id,
    'challenge_id',v_session.challenge_id,
    'nonce_b64url',v_session.nonce_b64url,
    'device_id',v_session.device_id,
    'owner_account_id',v_session.owner_id,
    'terminal_id',v_session.terminal_id,
    'auth_session_id',v_session.auth_session_id,
    'authority_version',v_session.authority_version,
    'authorization_epoch',v_session.authorization_epoch,
    'factory_reset_counter',v_session.factory_reset_counter,
    'device_event_sequence',v_session.device_event_sequence,
    'phase',v_session.phase,
    'version',v_session.version,
    'issued_at_ms',floor(extract(epoch from v_session.issued_at)*1000)::bigint,
    'expires_at_ms',floor(extract(epoch from v_session.expires_at)*1000)::bigint,
    'reused',false
  );
end;
$$;

create function public.get_robot_device_enrollment_context(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_enrollment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.robot_enrollment_sessions;
  v_device_id uuid;
  v_device public.devices;
  v_identity private.robot_manufacturing_identities;
  v_terminal public.account_terminals;
begin
  if p_user_id is null or p_auth_session_id is null or p_enrollment_id is null then
    return jsonb_build_object('found',false,'session',null,'manufacturing_identity',null);
  end if;

  select device_id into v_device_id
  from private.robot_enrollment_sessions
  where id=p_enrollment_id;
  if v_device_id is null then
    return jsonb_build_object('found',false,'session',null,'manufacturing_identity',null);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_device_id::text,0)
  );

  select * into v_session
  from private.robot_enrollment_sessions
  where id=p_enrollment_id
  for update;

  if v_session.id is null
     or v_session.owner_id is distinct from p_user_id
     or v_session.auth_session_id is distinct from p_auth_session_id then
    return jsonb_build_object('found',false,'session',null,'manufacturing_identity',null);
  end if;

  if v_session.phase in ('challenge_issued','identity_verified') and v_session.expires_at <= now() then
    update private.robot_enrollment_sessions
    set phase='expired',version=version+1,invalidation_reason='challenge_expired',updated_at=now()
    where id=v_session.id
    returning * into v_session;
    return jsonb_build_object('found',false,'session',null,'manufacturing_identity',null);
  end if;

  if v_session.phase not in ('challenge_issued','identity_verified') then
    return jsonb_build_object('found',false,'session',null,'manufacturing_identity',null);
  end if;

  select * into v_terminal
  from public.account_terminals
  where id=v_session.terminal_id
    and user_id=p_user_id
    and auth_session_id=p_auth_session_id
    and revoked_at is null;
  select * into v_device from public.devices where id=v_session.device_id;
  select * into v_identity
  from private.robot_manufacturing_identities
  where device_id=v_session.device_id and status='active';

  if not private.is_account_active_for(p_user_id)
     or v_terminal.id is null
     or v_device.id is null
     or v_device.owner_id is distinct from p_user_id
     or v_device.is_demo
     or v_device.robot_lifecycle <> 'owned'
     or v_device.robot_authority_version is distinct from v_session.authority_version
     or v_device.robot_authorization_epoch is distinct from v_session.authorization_epoch
     or v_identity.device_id is null
     or v_identity.factory_reset_counter is distinct from v_session.factory_reset_counter then
    update private.robot_enrollment_sessions
    set phase='invalidated',version=version+1,invalidation_reason='authority_changed',updated_at=now()
    where id=v_session.id and phase in ('challenge_issued','identity_verified');
    return jsonb_build_object('found',false,'session',null,'manufacturing_identity',null);
  end if;

  return jsonb_build_object(
    'found',true,
    'session',jsonb_build_object(
      'enrollment_id',v_session.id,
      'challenge_id',v_session.challenge_id,
      'nonce_b64url',v_session.nonce_b64url,
      'device_id',v_session.device_id,
      'owner_account_id',v_session.owner_id,
      'terminal_id',v_session.terminal_id,
      'auth_session_id',v_session.auth_session_id,
      'authority_version',v_session.authority_version,
      'authorization_epoch',v_session.authorization_epoch,
      'factory_reset_counter',v_session.factory_reset_counter,
      'device_event_sequence',v_session.device_event_sequence,
      'phase',v_session.phase,
      'version',v_session.version,
      'issued_at_ms',floor(extract(epoch from v_session.issued_at)*1000)::bigint,
      'expires_at_ms',floor(extract(epoch from v_session.expires_at)*1000)::bigint
    ),
    'manufacturing_identity',jsonb_build_object(
      'public_key_pem',v_identity.public_key_pem,
      'public_key_fingerprint',v_identity.public_key_fingerprint,
      'status',v_identity.status
    )
  );
end;
$$;

create function public.advance_robot_factory_reset_counter(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_enrollment_id uuid,
  p_expected_version bigint,
  p_next_factory_reset_counter bigint,
  p_device_event_sequence bigint,
  p_proof_digest text,
  p_proved_at_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.robot_enrollment_sessions;
  v_device_id uuid;
  v_device public.devices;
  v_identity private.robot_manufacturing_identities;
  v_terminal public.account_terminals;
  v_previous_counter bigint;
begin
  if p_user_id is null
     or p_auth_session_id is null
     or p_enrollment_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_next_factory_reset_counter is null
     or p_next_factory_reset_counter < 1
     or p_next_factory_reset_counter > 9007199254740991
     or p_device_event_sequence is null
     or p_device_event_sequence < 1
     or p_device_event_sequence > 9007199254740991
     or p_proof_digest is null
     or p_proof_digest !~ '^[0-9a-f]{64}$'
     or p_proved_at_ms is null
     or p_proved_at_ms < 1 then
    raise exception 'invalid robot factory reset proof commit';
  end if;

  select device_id into v_device_id
  from private.robot_enrollment_sessions
  where id=p_enrollment_id;
  if v_device_id is null then
    raise exception 'robot factory reset context changed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_device_id::text,0)
  );

  select * into v_session
  from private.robot_enrollment_sessions
  where id=p_enrollment_id
  for update;
  if v_session.id is null
     or v_session.owner_id is distinct from p_user_id
     or v_session.auth_session_id is distinct from p_auth_session_id
     or v_session.phase <> 'challenge_issued'
     or v_session.version <> p_expected_version
     or p_device_event_sequence <> v_session.device_event_sequence + 1
     or p_next_factory_reset_counter <= v_session.factory_reset_counter then
    raise exception 'robot factory reset context changed';
  end if;
  if v_session.expires_at <= now() then
    raise exception 'robot enrollment challenge expired';
  end if;
  if p_proved_at_ms < floor(extract(epoch from v_session.issued_at)*1000)::bigint
     or p_proved_at_ms > floor(extract(epoch from v_session.expires_at)*1000)::bigint then
    raise exception 'robot factory reset proof timestamp is outside the challenge lifetime';
  end if;

  select * into v_terminal
  from public.account_terminals
  where id=v_session.terminal_id
    and user_id=p_user_id
    and auth_session_id=p_auth_session_id
    and revoked_at is null
  for update;
  select * into v_device from public.devices where id=v_session.device_id for update;
  select * into v_identity
  from private.robot_manufacturing_identities
  where device_id=v_session.device_id and status='active'
  for update;

  if not private.is_account_active_for(p_user_id)
     or v_terminal.id is null
     or v_device.id is null
     or v_device.owner_id is distinct from p_user_id
     or v_device.is_demo
     or v_device.robot_lifecycle <> 'owned'
     or v_device.robot_authority_version is distinct from v_session.authority_version
     or v_device.robot_authorization_epoch is distinct from v_session.authorization_epoch
     or v_identity.device_id is null
     or v_identity.factory_reset_counter is distinct from v_session.factory_reset_counter then
    raise exception 'robot enrollment authority changed';
  end if;

  v_previous_counter := v_identity.factory_reset_counter;
  update private.robot_manufacturing_identities
  set factory_reset_counter=p_next_factory_reset_counter,
      last_reset_proof_digest=p_proof_digest,
      reset_counter_updated_at=to_timestamp(p_proved_at_ms/1000.0)
  where device_id=v_session.device_id
    and factory_reset_counter=v_previous_counter;
  if not found then
    raise exception 'robot factory reset context changed';
  end if;

  update public.devices
  set robot_authority_version=robot_authority_version+1,
      robot_authorization_epoch=robot_authorization_epoch+1,
      robot_public_key_pem=null,
      robot_public_key_fingerprint=null,
      robot_active_boot_id=null,
      updated_at=now()
  where id=v_session.device_id
    and robot_authority_version=v_session.authority_version
    and robot_authorization_epoch=v_session.authorization_epoch
  returning * into v_device;
  if v_device.id is null then
    raise exception 'robot factory reset context changed';
  end if;

  update private.robot_enrollment_sessions
  set phase='invalidated',
      version=version+1,
      device_event_sequence=p_device_event_sequence,
      identity_proof_digest=p_proof_digest,
      invalidation_reason='factory_reset_counter_advanced',
      updated_at=now()
  where id=v_session.id and version=p_expected_version
  returning * into v_session;
  if v_session.id is null then
    raise exception 'robot factory reset context changed';
  end if;

  insert into public.audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,metadata)
  values(p_user_id,p_user_id,'robot.factory_reset_counter_advanced','device',v_session.device_id::text,
    jsonb_build_object(
      'enrollmentId',v_session.id,
      'challengeId',v_session.challenge_id,
      'previousFactoryResetCounter',v_previous_counter,
      'factoryResetCounter',p_next_factory_reset_counter,
      'proofDigest',p_proof_digest,
      'authorityVersion',v_device.robot_authority_version,
      'authorizationEpoch',v_device.robot_authorization_epoch
    ));

  return jsonb_build_object(
    'enrollment_id',v_session.id,
    'device_id',v_session.device_id,
    'phase',v_session.phase,
    'version',v_session.version,
    'reason',v_session.invalidation_reason,
    'retry_required',true,
    'device_event_sequence',v_session.device_event_sequence,
    'factory_reset_counter',p_next_factory_reset_counter,
    'authority_version',v_device.robot_authority_version,
    'authorization_epoch',v_device.robot_authorization_epoch
  );
end;
$$;

create function public.confirm_robot_device_identity(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_enrollment_id uuid,
  p_expected_version bigint,
  p_device_event_sequence bigint,
  p_proof_digest text,
  p_proved_at_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.robot_enrollment_sessions;
  v_device_id uuid;
  v_device public.devices;
  v_identity private.robot_manufacturing_identities;
  v_terminal public.account_terminals;
begin
  if p_user_id is null
     or p_auth_session_id is null
     or p_enrollment_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_device_event_sequence is null
     or p_device_event_sequence < 1
     or p_device_event_sequence > 9007199254740991
     or p_proof_digest is null
     or p_proof_digest !~ '^[0-9a-f]{64}$'
     or p_proved_at_ms is null
     or p_proved_at_ms < 1 then
    raise exception 'invalid robot identity proof commit';
  end if;

  select device_id into v_device_id
  from private.robot_enrollment_sessions
  where id=p_enrollment_id;
  if v_device_id is null then
    raise exception 'robot enrollment context changed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_device_id::text,0)
  );

  select * into v_session
  from private.robot_enrollment_sessions
  where id=p_enrollment_id
  for update;
  if v_session.id is null
     or v_session.owner_id is distinct from p_user_id
     or v_session.auth_session_id is distinct from p_auth_session_id
     or v_session.phase <> 'challenge_issued'
     or v_session.version <> p_expected_version
     or p_device_event_sequence <> v_session.device_event_sequence + 1 then
    raise exception 'robot enrollment context changed';
  end if;
  if v_session.expires_at <= now() then
    raise exception 'robot enrollment challenge expired';
  end if;
  if p_proved_at_ms < floor(extract(epoch from v_session.issued_at)*1000)::bigint
     or p_proved_at_ms > floor(extract(epoch from v_session.expires_at)*1000)::bigint then
    raise exception 'robot identity proof timestamp is outside the challenge lifetime';
  end if;

  select * into v_terminal
  from public.account_terminals
  where id=v_session.terminal_id
    and user_id=p_user_id
    and auth_session_id=p_auth_session_id
    and revoked_at is null
  for update;
  select * into v_device from public.devices where id=v_session.device_id for update;
  select * into v_identity
  from private.robot_manufacturing_identities
  where device_id=v_session.device_id and status='active'
  for update;

  if not private.is_account_active_for(p_user_id)
     or v_terminal.id is null
     or v_device.id is null
     or v_device.owner_id is distinct from p_user_id
     or v_device.is_demo
     or v_device.robot_lifecycle <> 'owned'
     or v_device.robot_authority_version is distinct from v_session.authority_version
     or v_device.robot_authorization_epoch is distinct from v_session.authorization_epoch
     or v_identity.device_id is null
     or v_identity.factory_reset_counter is distinct from v_session.factory_reset_counter then
    raise exception 'robot enrollment authority changed';
  end if;

  update private.robot_enrollment_sessions
  set phase='identity_verified',
      version=version+1,
      device_event_sequence=p_device_event_sequence,
      identity_proof_digest=p_proof_digest,
      identity_verified_at=to_timestamp(p_proved_at_ms/1000.0),
      updated_at=now()
  where id=v_session.id and version=p_expected_version
  returning * into v_session;
  if v_session.id is null then
    raise exception 'robot enrollment context changed';
  end if;

  insert into public.audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,metadata)
  values(p_user_id,p_user_id,'robot.enrollment_identity_verified','device',v_session.device_id::text,
    jsonb_build_object(
      'enrollmentId',v_session.id,
      'challengeId',v_session.challenge_id,
      'proofDigest',v_session.identity_proof_digest,
      'factoryResetCounter',v_session.factory_reset_counter
    ));

  return jsonb_build_object(
    'enrollment_id',v_session.id,
    'device_id',v_session.device_id,
    'phase',v_session.phase,
    'version',v_session.version,
    'device_event_sequence',v_session.device_event_sequence,
    'expires_at_ms',floor(extract(epoch from v_session.expires_at)*1000)::bigint
  );
end;
$$;

create function public.complete_robot_device_enrollment(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_enrollment_id uuid,
  p_expected_version bigint,
  p_device_event_sequence bigint,
  p_completion_digest text,
  p_operational_public_key_pem text,
  p_operational_public_key_fingerprint text,
  p_active_boot_id text,
  p_confirmed_at_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.robot_enrollment_sessions;
  v_device_id uuid;
  v_device public.devices;
  v_identity private.robot_manufacturing_identities;
  v_terminal public.account_terminals;
  v_authority jsonb;
begin
  if p_user_id is null
     or p_auth_session_id is null
     or p_enrollment_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_device_event_sequence is null
     or p_device_event_sequence < 1
     or p_device_event_sequence > 9007199254740991
     or p_completion_digest is null
     or p_completion_digest !~ '^[0-9a-f]{64}$'
     or p_confirmed_at_ms is null
     or p_confirmed_at_ms < 1 then
    raise exception 'invalid robot enrollment completion';
  end if;

  select device_id into v_device_id
  from private.robot_enrollment_sessions
  where id=p_enrollment_id;
  if v_device_id is null then
    raise exception 'robot enrollment context changed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_device_id::text,0)
  );

  select * into v_session
  from private.robot_enrollment_sessions
  where id=p_enrollment_id
  for update;
  if v_session.id is null
     or v_session.owner_id is distinct from p_user_id
     or v_session.auth_session_id is distinct from p_auth_session_id
     or v_session.phase <> 'identity_verified'
     or v_session.version <> p_expected_version
     or p_device_event_sequence <> v_session.device_event_sequence + 1 then
    raise exception 'robot enrollment context changed';
  end if;
  if v_session.expires_at <= now() then
    raise exception 'robot enrollment challenge expired';
  end if;
  if p_confirmed_at_ms < floor(extract(epoch from v_session.issued_at)*1000)::bigint
     or p_confirmed_at_ms > floor(extract(epoch from v_session.expires_at)*1000)::bigint then
    raise exception 'robot online confirmation timestamp is outside the challenge lifetime';
  end if;

  select * into v_terminal
  from public.account_terminals
  where id=v_session.terminal_id
    and user_id=p_user_id
    and auth_session_id=p_auth_session_id
    and revoked_at is null
  for update;
  select * into v_device from public.devices where id=v_session.device_id for update;
  select * into v_identity
  from private.robot_manufacturing_identities
  where device_id=v_session.device_id and status='active'
  for update;

  if not private.is_account_active_for(p_user_id)
     or v_terminal.id is null
     or v_device.id is null
     or v_device.owner_id is distinct from p_user_id
     or v_device.is_demo
     or v_device.robot_lifecycle <> 'owned'
     or v_device.robot_authority_version is distinct from v_session.authority_version
     or v_device.robot_authorization_epoch is distinct from v_session.authorization_epoch
     or v_identity.device_id is null
     or v_identity.factory_reset_counter is distinct from v_session.factory_reset_counter then
    raise exception 'robot enrollment authority changed';
  end if;

  v_authority := public.provision_robot_device_authority(
    v_session.device_id,
    p_operational_public_key_pem,
    p_operational_public_key_fingerprint,
    p_active_boot_id,
    'enrollment_online_confirmation'
  );

  update private.robot_enrollment_sessions
  set phase='completed',
      version=version+1,
      device_event_sequence=p_device_event_sequence,
      completion_digest=p_completion_digest,
      completed_at=to_timestamp(p_confirmed_at_ms/1000.0),
      updated_at=now()
  where id=v_session.id and version=p_expected_version
  returning * into v_session;
  if v_session.id is null then
    raise exception 'robot enrollment context changed';
  end if;

  insert into public.audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,metadata)
  values(p_user_id,p_user_id,'robot.enrollment_completed','device',v_session.device_id::text,
    jsonb_build_object(
      'enrollmentId',v_session.id,
      'challengeId',v_session.challenge_id,
      'completionDigest',v_session.completion_digest,
      'operationalPublicKeyFingerprint',p_operational_public_key_fingerprint,
      'activeBootId',p_active_boot_id,
      'factoryResetCounter',v_session.factory_reset_counter
    ));

  return jsonb_build_object(
    'enrollment_id',v_session.id,
    'device_id',v_session.device_id,
    'phase',v_session.phase,
    'version',v_session.version,
    'device_event_sequence',v_session.device_event_sequence
  ) || v_authority;
end;
$$;

revoke all on function public.register_robot_manufacturing_identity(uuid,text,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.register_robot_manufacturing_identity(uuid,text,text,bigint)
  to service_role;

revoke all on function public.begin_robot_device_enrollment(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.begin_robot_device_enrollment(uuid,uuid,uuid)
  to service_role;

revoke all on function public.get_robot_device_enrollment_context(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_robot_device_enrollment_context(uuid,uuid,uuid)
  to service_role;

revoke all on function public.advance_robot_factory_reset_counter(uuid,uuid,uuid,bigint,bigint,bigint,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.advance_robot_factory_reset_counter(uuid,uuid,uuid,bigint,bigint,bigint,text,bigint)
  to service_role;

revoke all on function public.confirm_robot_device_identity(uuid,uuid,uuid,bigint,bigint,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.confirm_robot_device_identity(uuid,uuid,uuid,bigint,bigint,text,bigint)
  to service_role;

revoke all on function public.complete_robot_device_enrollment(uuid,uuid,uuid,bigint,bigint,text,text,text,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.complete_robot_device_enrollment(uuid,uuid,uuid,bigint,bigint,text,text,text,text,bigint)
  to service_role;

comment on table private.robot_manufacturing_identities is
  'Factory-installed Ed25519 keys are immutable; their signed hardware reset counter advances monotonically. Runtime robot authority keys remain on public.devices.';
comment on table private.robot_enrollment_sessions is
  'Short-lived, one-time robot enrollment challenges fenced to owner, terminal, session, authority epoch and factory reset counter.';
