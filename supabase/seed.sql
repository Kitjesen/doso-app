-- Local development account only. Never reuse this password in production.
-- Email: demo@doso.local
-- Password: DosoDemo123!

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values (
  'd0500000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'demo@doso.local',
  crypt('DosoDemo123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DOSO Demo"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  'd0500000-0000-4000-8000-000000000001',
  'd0500000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'sub', 'd0500000-0000-4000-8000-000000000001',
    'email', 'demo@doso.local',
    'email_verified', true
  ),
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

insert into public.devices (
  id,
  owner_id,
  model_code,
  display_name,
  category,
  environment,
  connection_status,
  safety_lock,
  alerts_enabled,
  battery_percent,
  firmware_version,
  runtime_hours,
  is_demo
)
values (
  'd0500000-0000-4000-8000-000000000101',
  'd0500000-0000-4000-8000-000000000001',
  'thunder-01',
  'THUNDER 01 Demo',
  '四足',
  '室外',
  'offline',
  true,
  true,
  86,
  '0.9.0-demo',
  12.5,
  true
)
on conflict (id) do nothing;
