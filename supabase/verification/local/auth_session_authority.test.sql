\set ON_ERROR_STOP on

begin;

insert into auth.sessions(id, user_id, created_at, updated_at) values (
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  clock_timestamp(),
  clock_timestamp()
);

insert into public.account_terminals(
  id, user_id, auth_session_id, installation_id, platform, device_label
) values (
  '95000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'authority-fixture',
  'android',
  'Synthetic Authority Fixture'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000001"}',
  true
);

do $active_before_delete$
begin
  if not private.is_session_active() then
    raise exception 'seeded_auth_session_and_terminal_must_be_active';
  end if;
end;
$active_before_delete$;

delete from auth.sessions
where id = '93000000-0000-4000-8000-000000000001';

do $inactive_after_delete$
begin
  if private.is_session_active() then
    raise exception 'deleted_auth_session_must_be_inactive';
  end if;
end;
$inactive_after_delete$;

rollback;

\echo 'auth_session_authority_test_pass'
