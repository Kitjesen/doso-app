\set ON_ERROR_STOP on

-- Candidate-only synthetic recovery contract. This exercises PostgreSQL/RLS
-- behavior, not JWT verification, the Storage HTTP API, object bytes or S3.
do $guard$
begin
  if pg_catalog.current_database() <> 'doso_avatar_race_fixture'
     or pg_catalog.to_regprocedure('private.is_current_auth_session_present()') is null
     or pg_catalog.to_regprocedure('public.prepare_my_profile_avatar_cleanup(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.update_my_profile(uuid,text,text,text,text)') is null then
    raise exception 'auth_session_avatar_recovery_fixture_not_ready';
  end if;
end;
$guard$;

-- Session 6 creates an owner object and durably retires it while both Auth and
-- DOSO terminal authority are still valid.
insert into auth.sessions(id,user_id,created_at,updated_at) values (
  '93000000-0000-4000-8000-000000000006',
  '91000000-0000-4000-8000-000000000001',now(),now()
);

begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000006"}',
  true
);
select public.register_account_terminal(
  'avatar-recovery-session-six','android','Avatar Recovery Six','1.0','Synthetic'
);
insert into storage.objects(bucket_id,name) values (
  'profile-avatars',
  '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
);
do $prepare_session_six$
declare cleanup jsonb;
begin
  cleanup := public.prepare_my_profile_avatar_cleanup(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
  );
  if cleanup->>'status' is distinct from 'retired' then
    raise exception 'session_six_cleanup_not_retired';
  end if;
end;
$prepare_session_six$;
commit;

create temporary table avatar_recovery_after_prepare as
select username,display_name,avatar_url,avatar_lifecycle_epoch
from public.profiles
where id='91000000-0000-4000-8000-000000000001';

-- Removing only the Auth session leaves the active DOSO terminal behind. Fresh
-- statements bearing that old session claim must nevertheless lose authority.
delete from auth.sessions
where id='93000000-0000-4000-8000-000000000006';

begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000006"}',
  true
);
do $deleted_session_six$
declare affected integer;
begin
  if private.is_session_active() then
    raise exception 'deleted_session_six_still_active';
  end if;
  if (select pg_catalog.count(*) from storage.objects
      where bucket_id='profile-avatars') <> 0 then
    raise exception 'deleted_session_six_storage_visible';
  end if;
  begin
    insert into storage.objects(bucket_id,name) values (
      'profile-avatars',
      '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000008.png'
    );
    raise exception 'deleted_session_six_upload_accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.prepare_my_profile_avatar_cleanup(
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
    );
    raise exception 'deleted_session_six_prepare_accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'account_or_session_inactive' then raise; end if;
  end;
  delete from storage.objects
  where bucket_id='profile-avatars'
    and name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'deleted_session_six_delete_accepted';
  end if;
  begin
    perform public.update_my_profile(
      '91000000-0000-4000-8000-000000000001',
      'fixture_owner','Blocked Old Session','replace',
      'profile-avatars/91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
    );
    raise exception 'deleted_session_six_attach_accepted';
  exception when raise_exception then
    if sqlerrm <> 'account_or_session_inactive' then raise; end if;
  end;
end;
$deleted_session_six$;
commit;

do $old_session_preserved_state$
begin
  if not exists (
    select 1 from public.account_terminals
    where user_id='91000000-0000-4000-8000-000000000001'
      and auth_session_id='93000000-0000-4000-8000-000000000006'
      and revoked_at is null
  ) then
    raise exception 'deleted_auth_session_terminal_not_preserved';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id='profile-avatars'
      and name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
  ) or not exists (
    select 1 from private.profile_avatar_retirements
    where owner_id='91000000-0000-4000-8000-000000000001'
      and object_path='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
  ) then
    raise exception 'deleted_session_six_cleanup_debt_lost';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id='profile-avatars'
      and name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000008.png'
  ) then
    raise exception 'deleted_session_six_upload_persisted';
  end if;
  if not exists (
    select 1
    from public.profiles as current_profile
    join avatar_recovery_after_prepare as expected
      on current_profile.username is not distinct from expected.username
     and current_profile.display_name is not distinct from expected.display_name
     and current_profile.avatar_url is not distinct from expected.avatar_url
     and current_profile.avatar_lifecycle_epoch is not distinct from expected.avatar_lifecycle_epoch
    where current_profile.id='91000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'deleted_session_six_profile_changed';
  end if;
end;
$old_session_preserved_state$;

-- A newly registered Auth+terminal session for the same owner can settle the
-- old retirement, while the retired path remains permanently unusable.
insert into auth.sessions(id,user_id,created_at,updated_at) values (
  '93000000-0000-4000-8000-000000000007',
  '91000000-0000-4000-8000-000000000001',now(),now()
);

begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000007"}',
  true
);
select public.register_account_terminal(
  'avatar-recovery-session-seven','android','Avatar Recovery Seven','1.0','Synthetic'
);
do $recover_with_session_seven$
declare
  cleanup jsonb;
  affected integer;
begin
  if not private.is_session_active() then
    raise exception 'session_seven_not_active';
  end if;
  cleanup := public.prepare_my_profile_avatar_cleanup(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
  );
  if cleanup->>'status' is distinct from 'retired' then
    raise exception 'session_seven_cannot_resume_retirement';
  end if;
  delete from storage.objects
  where bucket_id='profile-avatars'
    and name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'session_seven_retired_delete_count_invalid';
  end if;
  begin
    insert into storage.objects(bucket_id,name) values (
      'profile-avatars',
      '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
    );
    raise exception 'session_seven_retired_reupload_accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_my_profile(
      '91000000-0000-4000-8000-000000000001',
      'fixture_owner','Avatar Recovery','replace',
      'profile-avatars/91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
    );
    raise exception 'session_seven_retired_attach_accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'avatar_retired' then raise; end if;
  end;
  insert into storage.objects(bucket_id,name) values (
    'profile-avatars',
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000007.png'
  );
  perform public.update_my_profile(
    '91000000-0000-4000-8000-000000000001',
    'fixture_owner','Avatar Recovery','replace',
    'profile-avatars/91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000007.png'
  );
end;
$recover_with_session_seven$;
commit;

do $recovery_final_state$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id='profile-avatars'
      and name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
  ) or not exists (
    select 1 from private.profile_avatar_retirements
    where owner_id='91000000-0000-4000-8000-000000000001'
      and object_path='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000006.png'
  ) then
    raise exception 'session_seven_old_retirement_final_state_invalid';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id='profile-avatars'
      and name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000007.png'
  ) or not exists (
    select 1 from public.profiles
    where id='91000000-0000-4000-8000-000000000001'
      and avatar_url='profile-avatars/91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000007.png'
  ) then
    raise exception 'session_seven_new_avatar_recovery_failed';
  end if;
end;
$recovery_final_state$;

\echo 'auth_session_avatar_recovery_pass'
