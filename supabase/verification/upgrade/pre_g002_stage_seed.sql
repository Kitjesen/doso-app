-- Continue the hosted-head release chain after applying the two formerly
-- pending migrations 20260823130000 and 20260824090000, but before G002
-- 20260824100000. These rows use the real one-time username behavior and RPC.

do $sentinel$
begin
  if pg_catalog.to_regclass('private.doso_upgrade_harness_sentinel') is null
     or not exists (
       select 1 from private.doso_upgrade_harness_sentinel
       where scenario = 'hosted_head_20260823111035_to_g002'
     ) then
    raise exception using errcode = 'P0001', message = 'upgrade_harness_sentinel_required';
  end if;
end;
$sentinel$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '86000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'stage-registration@upgrade.test', crypt('ReleaseChain106', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":" Stage_Registration ","display_name":"Stage Registration"}'::jsonb,
    '2026-02-06 00:00:00+00', '2026-02-06 00:00:00+00'
  ),
  (
    '87000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"custom:qq","providers":["custom:qq"]}'::jsonb,
    '{"full_name":"Stage Manual"}'::jsonb,
    '2026-02-07 00:00:00+00', '2026-02-07 00:00:00+00'
  ),
  (
    '88000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"apple","providers":["apple"]}'::jsonb,
    '{"username":"provider_suggested","full_name":"Stage Social"}'::jsonb,
    '2026-02-08 00:00:00+00', '2026-02-08 00:00:00+00'
  );

insert into public.account_terminals (
  user_id, auth_session_id, installation_id, platform, device_label,
  first_seen_at, last_seen_at
)
values
  ('86000000-0000-4000-8000-000000000006', '86000000-0000-4000-8000-000000000106', 'chain-registration', 'web', 'Registration browser', now(), now()),
  ('87000000-0000-4000-8000-000000000007', '87000000-0000-4000-8000-000000000107', 'chain-manual', 'android', 'Manual phone', now(), now()),
  ('88000000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000108', 'chain-social', 'ios', 'Social phone', now(), now());

set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"87000000-0000-4000-8000-000000000007","role":"authenticated","session_id":"87000000-0000-4000-8000-000000000107"}',
  false
);
select public.claim_username(' Stage_Manual ');
reset role;
select set_config('request.jwt.claims', '{}', false);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  (
    '86000000-0000-4000-8000-000000000206', 'chain-email-subject',
    '86000000-0000-4000-8000-000000000006',
    '{"sub":"chain-email-subject","email_verified":false,"provider_token":"must-not-leak-email"}'::jsonb,
    'email', '2026-02-06 00:10:00+00', '2026-02-06 00:01:00+00', '2026-02-06 00:10:00+00'
  ),
  (
    '88000000-0000-4000-8000-000000000208', 'chain-apple-subject',
    '88000000-0000-4000-8000-000000000008',
    '{"sub":"chain-apple-subject","email_verified":true,"provider_token":"must-not-leak-apple"}'::jsonb,
    'apple', '2026-02-08 00:10:00+00', '2026-02-08 00:01:00+00', '2026-02-08 00:10:00+00'
  );
