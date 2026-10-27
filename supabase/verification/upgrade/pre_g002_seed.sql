-- Additional deterministic corrective-path fixture at 20260824090000. This is
-- not the hosted production head; the hosted-head scenario starts at
-- 20260823111035 in pre_username_seed.sql. This file intentionally contains no
-- G002-only columns or enum references.

create table private.doso_upgrade_harness_sentinel (
  scenario text primary key,
  seeded_at timestamptz not null default pg_catalog.clock_timestamp()
);

insert into private.doso_upgrade_harness_sentinel (scenario)
values ('internal_pre_g002_corrective');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '71000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'fingerprint@upgrade.test', crypt('UpgradePass101', gen_salt('bf')),
    '2026-01-01 00:00:00+00', '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"fingerprint_name","display_name":"Fingerprint Legacy"}'::jsonb,
    '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'
  ),
  (
    '72000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'registration@upgrade.test', crypt('UpgradePass102', gen_salt('bf')),
    '2026-01-02 00:00:00+00', '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"registration_seed","display_name":"Registration Seed"}'::jsonb,
    '2026-01-02 00:00:00+00', '2026-01-02 00:00:00+00'
  ),
  (
    '73000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'manual@upgrade.test', crypt('UpgradePass103', gen_salt('bf')),
    '2026-01-03 00:00:00+00', '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Manual Seed"}'::jsonb,
    '2026-01-03 00:00:00+00', '2026-01-03 00:00:00+00'
  ),
  (
    '74000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"apple","providers":["apple"]}'::jsonb,
    '{"username":"provider_supplied","full_name":"Apple Provisional"}'::jsonb,
    '2026-01-04 00:00:00+00', '2026-01-04 00:00:00+00'
  ),
  (
    '75000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'legacy-null@upgrade.test', crypt('UpgradePass105', gen_salt('bf')),
    '2026-01-05 00:00:00+00', '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Legacy Null"}'::jsonb,
    '2026-01-05 00:00:00+00', '2026-01-05 00:00:00+00'
  ),
  (
    '76000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"custom:qq","providers":["custom:qq"]}'::jsonb,
    '{"full_name":"Social Previously Claimed"}'::jsonb,
    '2026-01-06 00:00:00+00', '2026-01-06 00:00:00+00'
  ),
  (
    '77000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"custom:wechat","providers":["custom:wechat"]}'::jsonb,
    '{"full_name":"Social Fingerprint"}'::jsonb,
    '2026-01-07 00:00:00+00', '2026-01-07 00:00:00+00'
  ),
  (
    '78000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"apple","providers":["apple"]}'::jsonb,
    '{"full_name":"Collision Waiter"}'::jsonb,
    '2026-01-08 00:00:00+00', '2026-01-08 00:00:00+00'
  );

-- Recreate the legacy states observed in a database that has accepted users
-- across several application releases. Fixed timestamps make classification
-- deterministic and distinguish explicit claims from the old backfill marker.
update public.profiles
set username = 'fingerprint_name',
    display_name = 'Fingerprint Legacy',
    created_at = '2026-01-01 00:00:00+00',
    username_claimed_at = '2026-01-01 00:00:00+00'
where id = '71000000-0000-4000-8000-000000000001';

update public.profiles
set username = 'registration_seed',
    display_name = 'Registration Seed',
    created_at = '2026-01-02 00:00:00+00',
    username_claimed_at = '2026-01-02 00:05:00+00'
where id = '72000000-0000-4000-8000-000000000002';

update public.profiles
set username = 'manual_seed',
    display_name = 'Manual Seed',
    created_at = '2026-01-03 00:00:00+00',
    username_claimed_at = '2026-01-03 00:06:00+00'
where id = '73000000-0000-4000-8000-000000000003';

update public.profiles
set username = 'social_seed',
    display_name = 'Apple Provisional',
    created_at = '2026-01-04 00:00:00+00',
    username_claimed_at = null
where id = '74000000-0000-4000-8000-000000000004';

update public.profiles
set username = 'legacy_null',
    display_name = 'Legacy Null',
    created_at = '2026-01-05 00:00:00+00',
    username_claimed_at = null
where id = '75000000-0000-4000-8000-000000000005';

update public.profiles
set username = 'social_claimed',
    display_name = 'Social Previously Claimed',
    created_at = '2026-01-06 00:00:00+00',
    username_claimed_at = '2026-01-06 00:07:00+00'
where id = '76000000-0000-4000-8000-000000000006';

update public.profiles
set username = 'social_fingerprint',
    display_name = 'Social Fingerprint',
    created_at = '2026-01-07 00:00:00+00',
    username_claimed_at = '2026-01-07 00:00:00+00'
where id = '77000000-0000-4000-8000-000000000007';

update public.profiles
set username = 'collision_waiter',
    display_name = 'Collision Waiter',
    created_at = '2026-01-08 00:00:00+00',
    username_claimed_at = null
where id = '78000000-0000-4000-8000-000000000008';

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values (
  '74000000-0000-4000-8000-000000000104',
  'upgrade-apple-subject',
  '74000000-0000-4000-8000-000000000004',
  '{"sub":"upgrade-apple-subject","email_verified":true,"provider_token":"must-not-leak"}'::jsonb,
  'apple',
  '2026-01-04 00:10:00+00',
  '2026-01-04 00:01:00+00',
  '2026-01-04 00:10:00+00'
);

insert into public.account_terminals (
  user_id, auth_session_id, installation_id, platform, device_label, first_seen_at, last_seen_at
)
values
  ('71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000101', 'upgrade-legacy', 'web', 'Legacy browser', '2026-01-01 00:10:00+00', '2026-01-01 00:10:00+00'),
  ('72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000102', 'upgrade-registration', 'web', 'Registration browser', '2026-01-02 00:10:00+00', '2026-01-02 00:10:00+00'),
  ('74000000-0000-4000-8000-000000000004', '74000000-0000-4000-8000-000000000104', 'upgrade-apple', 'ios', 'Apple phone', '2026-01-04 00:10:00+00', '2026-01-04 00:10:00+00'),
  ('78000000-0000-4000-8000-000000000008', '78000000-0000-4000-8000-000000000108', 'upgrade-collision', 'android', 'Collision phone', '2026-01-08 00:10:00+00', '2026-01-08 00:10:00+00');
