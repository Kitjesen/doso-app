-- Hosted-production release-chain fixture. Run only at the exact verified
-- hosted head 20260823111035, after canonical username allocation exists and
-- before the five pending migrations beginning with 20260823130000.

create table private.doso_upgrade_harness_sentinel (
  scenario text primary key,
  seeded_at timestamptz not null default pg_catalog.clock_timestamp()
);

insert into private.doso_upgrade_harness_sentinel (scenario)
values ('hosted_head_20260823111035_to_g002');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'raw-primary@upgrade.test', crypt('ReleaseChain101', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"abcdefghijklmnopqrstuvwx","display_name":"Raw Primary"}'::jsonb,
    '2026-02-01 00:00:00+00', '2026-02-01 00:00:00+00'
  ),
  (
    '81100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'raw-collision@upgrade.test', crypt('ReleaseChain102', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"abcdefghijklmnopqrstuv_2","display_name":"Raw Secondary"}'::jsonb,
    '2026-02-01 00:01:00+00', '2026-02-01 00:01:00+00'
  ),
  (
    '82000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'display@upgrade.test', crypt('ReleaseChain103', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Display Source"}'::jsonb,
    '2026-02-02 00:00:00+00', '2026-02-02 00:00:00+00'
  ),
  (
    '83000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'Email.Prefix+tag@upgrade.test', crypt('ReleaseChain104', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '2026-02-03 00:00:00+00', '2026-02-03 00:00:00+00'
  ),
  (
    '84000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"apple","providers":["apple"]}'::jsonb, '{}'::jsonb,
    '2026-02-04 00:00:00+00', '2026-02-04 00:00:00+00'
  ),
  (
    '84000000-0000-4001-8000-000000000005', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"custom:wechat","providers":["custom:wechat"]}'::jsonb, '{}'::jsonb,
    '2026-02-04 00:01:00+00', '2026-02-04 00:01:00+00'
  );

-- The hosted-head profile trigger uses wall-clock defaults. Pin profile
-- creation order so the subsequent 130000 claimed-marker migration and G002
-- corrective classification are reproducible. Every raw username supplied
-- above is already unique; this scenario does not impersonate the earlier
-- 23110629 historical backfill execution.
update public.profiles as profiles
set created_at = users.created_at,
    updated_at = users.updated_at
from auth.users as users
where profiles.id = users.id
  and users.id in (
    '81000000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000004',
    '84000000-0000-4000-8000-000000000004', '84000000-0000-4001-8000-000000000005'
  );
