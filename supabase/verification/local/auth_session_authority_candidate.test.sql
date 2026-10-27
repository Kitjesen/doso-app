\set ON_ERROR_STOP on

-- Seed as fixture owner. Every product behavior below runs as authenticated.
update auth.users set email = 'authority-owner@fixture.invalid'
where id = '91000000-0000-4000-8000-000000000001';
insert into auth.users(id,email) values
  ('91000000-0000-4000-8000-000000000002','authority-foreign@fixture.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',now(),now()),
  ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001',now(),now()),
  ('93000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001',now(),now()),
  ('93000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000001',now(),now()),
  ('93000000-0000-4000-8000-000000000099','91000000-0000-4000-8000-000000000002',now(),now());
insert into public.account_terminals(id,user_id,auth_session_id,installation_id,platform,device_label,revoked_at) values
  ('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','authority-one','android','Authority One',null),
  ('95000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','authority-two','ios','Authority Two',null),
  ('95000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000003','authority-revoked','web','Authority Revoked',now()),
  ('95000000-0000-4000-8000-000000000099','91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000099','authority-foreign','android','Authority Foreign',null);

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000001"}',true);
do $valid_session$
declare cleanup jsonb;
begin
  if not private.is_session_active() then raise exception 'valid_session_rejected'; end if;
  if not has_function_privilege(current_user,'private.is_session_active()','EXECUTE') then
    raise exception 'is_session_active_execute_missing';
  end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'valid_profile_read_rejected'; end if;
  if has_table_privilege(current_user,'auth.sessions','SELECT') then raise exception 'auth_sessions_select_leaked'; end if;
  if has_function_privilege(current_user,'private.is_current_auth_session_present()','EXECUTE') then
    raise exception 'auth_session_helper_execute_leaked';
  end if;
  perform public.update_my_profile(
    '91000000-0000-4000-8000-000000000001','fixture_owner','Authority Updated','keep',null);
  insert into storage.objects(bucket_id,name) values(
    'profile-avatars','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000002.png');
  if (select count(*) from storage.objects where name like '%0002.png') <> 1 then
    raise exception 'valid_storage_select_rejected';
  end if;
  cleanup := public.prepare_my_profile_avatar_cleanup(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000002.png');
  if cleanup->>'status' is distinct from 'retired' then raise exception 'valid_cleanup_prepare_rejected'; end if;
  delete from storage.objects where bucket_id='profile-avatars'
    and name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000002.png';
  if found then null; else raise exception 'valid_storage_delete_rejected'; end if;
  insert into storage.objects(bucket_id,name) values(
    'profile-avatars','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000003.png');
  cleanup := public.prepare_my_profile_avatar_cleanup(
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000003.png');
  if cleanup->>'status' is distinct from 'retired' then raise exception 'deleted_session_fixture_not_retired'; end if;
end;
$valid_session$;
commit;

-- Delete and commit the Auth session before testing fresh client statements.
delete from auth.sessions where id='93000000-0000-4000-8000-000000000001';

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000001"}',true);
do $deleted_session$
declare affected integer;
begin
  if private.is_session_active() then raise exception 'deleted_session_still_active'; end if;
  if (select count(*) from public.profiles) <> 0 then raise exception 'deleted_session_profile_visible'; end if;
  if (select count(*) from storage.objects) <> 0 then raise exception 'deleted_session_storage_visible'; end if;
  begin
    perform public.update_my_profile(
      '91000000-0000-4000-8000-000000000001','fixture_owner','Blocked','keep',null);
    raise exception 'deleted_session_profile_rpc_accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'account_or_session_inactive' then raise; end if;
  end;
  begin
    insert into storage.objects(bucket_id,name) values(
      'profile-avatars','91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000004.png');
    raise exception 'deleted_session_storage_insert_accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.prepare_my_profile_avatar_cleanup(
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000003.png');
    raise exception 'deleted_session_cleanup_prepare_accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'account_or_session_inactive' then raise; end if;
  end;
  delete from storage.objects where bucket_id='profile-avatars'
    and name='91000000-0000-4000-8000-000000000001/94000000-0000-4000-8000-000000000003.png';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'deleted_session_storage_delete_accepted'; end if;
end;
$deleted_session$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000002"}',true);
do $other_valid_session$
begin
  if not private.is_session_active() then raise exception 'other_valid_session_rejected'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'other_valid_session_profile_hidden'; end if;
end;
$other_valid_session$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000099"}',true);
do $foreign_session$
begin
  if private.is_session_active() then raise exception 'foreign_owned_session_accepted'; end if;
end;
$foreign_session$;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $null_session$ begin
  if private.is_session_active() then raise exception 'null_session_accepted'; end if;
end; $null_session$;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"not-a-uuid"}',true);
do $malformed_session$ begin
  if private.is_session_active() then raise exception 'malformed_session_accepted'; end if;
end; $malformed_session$;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000003"}',true);
do $revoked_terminal$ begin
  if private.is_session_active() then raise exception 'revoked_terminal_accepted'; end if;
end; $revoked_terminal$;
commit;

\echo 'candidate_shared_gate_pass'

update public.account_email_features set enabled=true where kind='new_device_login';
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000005"}',true);
select public.register_account_terminal('first-installation','android','First Device','1.0','Synthetic');
select public.register_account_terminal('replacement-installation','android','Updated Device','1.1','Synthetic');
commit;

do $register_positive$
declare terminal public.account_terminals;
begin
  select * into terminal from public.account_terminals
  where auth_session_id='93000000-0000-4000-8000-000000000005';
  if terminal.installation_id is distinct from 'first-installation' then
    raise exception 'register_first_installation_not_retained';
  end if;
  if (select count(*) from public.account_email_outbox
      where user_id='91000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'register_email_not_deduplicated';
  end if;
  if (select count(*) from public.audit_logs
      where action='terminal.register' and resource_id=terminal.id::text
        and metadata->>'accountSecurityEmail' in ('queued','deduplicated')) <> 2 then
    raise exception 'register_email_audit_missing';
  end if;
end;
$register_positive$;

create temp table register_negative_counts as
select
  (select count(*) from public.account_terminals) as terminals,
  (select count(*) from public.account_email_outbox) as outbox,
  (select count(*) from public.audit_logs) as audits;

-- Deliberate next RED: latest register body must reject an unbacked Auth session without writes.
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000004"}',true);
do $register_guard$
begin
  begin
    perform public.register_account_terminal('missing-auth-session','android','Missing Auth Session','1.0','Synthetic');
    raise exception 'register_missing_auth_session_was_accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'auth_session_inactive' then raise; end if;
  end;
end;
$register_guard$;
commit;

do $register_no_writes$
begin
  if exists (select 1 from public.account_terminals
      where auth_session_id='93000000-0000-4000-8000-000000000004') then
    raise exception 'register_missing_auth_session_terminal_written';
  end if;
  if (select count(*) from public.account_terminals) <> (select terminals from register_negative_counts)
    or (select count(*) from public.account_email_outbox) <> (select outbox from register_negative_counts)
    or (select count(*) from public.audit_logs) <> (select audits from register_negative_counts) then
    raise exception 'register_missing_auth_session_side_effect';
  end if;
end;
$register_no_writes$;

-- Existing Auth session, wrong owner, and no terminal conflict to mask a missing
-- owner predicate. Synthetic session 106 is disjoint from recovery sessions 6/7.
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('93000000-0000-4000-8000-000000000106','91000000-0000-4000-8000-000000000002',now(),now());
do $register_foreign_prerequisites$
begin
  if not exists (select 1 from auth.sessions
      where id='93000000-0000-4000-8000-000000000106'
        and user_id='91000000-0000-4000-8000-000000000002')
    or exists (select 1 from public.account_terminals
      where auth_session_id='93000000-0000-4000-8000-000000000106')
    or not coalesce((select enabled from public.account_email_features
      where kind='new_device_login'),false) then
    raise exception 'register_foreign_auth_session_fixture_invalid';
  end if;
end;
$register_foreign_prerequisites$;

-- Owner-visible complete rows, not an RLS-filtered count. Equality after COMMIT
-- detects durable INSERT/UPDATE/DELETE effects, but does not assert that sequences
-- or locks were never touched by an attempted/rolled-back statement.
create temp table register_foreign_snapshot as
select
  (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)
    from public.account_terminals t) as terminals,
  (select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)
    from public.account_email_outbox o) as outbox,
  (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)
    from public.audit_logs a) as audits;

begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000106"}',true);
do $register_foreign_guard$
begin
  if current_user <> 'authenticated'
    or auth.uid() is distinct from '91000000-0000-4000-8000-000000000001'::uuid
    or private.current_session_id() is distinct from '93000000-0000-4000-8000-000000000106'::uuid then
    raise exception 'register_foreign_auth_session_claims_invalid';
  end if;
  begin
    perform public.register_account_terminal('foreign-owner-installation','android','Foreign Auth Session','1.0','Synthetic');
    raise exception 'register_foreign_auth_session_was_accepted';
  exception when sqlstate '42501' then
    if sqlerrm <> 'auth_session_inactive' then raise; end if;
  end;
end;
$register_foreign_guard$;
commit;

do $register_foreign_no_row_changes$
begin
  if (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)
      from public.account_terminals t) is distinct from (select terminals from register_foreign_snapshot)
    or (select coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]'::jsonb)
      from public.account_email_outbox o) is distinct from (select outbox from register_foreign_snapshot)
    or (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)
      from public.audit_logs a) is distinct from (select audits from register_foreign_snapshot) then
    raise exception 'register_foreign_auth_session_durable_row_change';
  end if;
end;
$register_foreign_no_row_changes$;

\echo 'register_foreign_auth_session_rejected_without_row_changes'
\echo 'candidate_auth_session_authority_pass'
