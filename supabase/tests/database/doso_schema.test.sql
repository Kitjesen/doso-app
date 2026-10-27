begin;

create extension if not exists pgtap with schema extensions;
select plan(214);

select has_table('public', 'profiles', 'profiles table is available'); -- 1
select has_table('public', 'devices', 'devices table is available'); -- 2
select has_table('public', 'account_terminals', 'account terminals table is available'); -- 3
select has_table('public', 'audit_logs', 'audit log table is available'); -- 4
select has_table('private', 'device_claims', 'private device claims table is available'); -- 5
select has_table('private', 'account_identities', 'DOSO external identity registry is available');
select has_column('public', 'profiles', 'app_role', 'profiles include an application role'); -- 6
select has_column('public', 'profiles', 'account_status', 'profiles include account status'); -- 7
select has_column('public', 'profiles', 'username', 'profiles include a canonical username');
select has_column('public', 'profiles', 'username_claimed_at', 'profiles track when a username becomes permanent');
select has_column('public', 'profiles', 'username_provenance', 'profiles track the trusted username origin');
select col_not_null('public', 'profiles', 'username_provenance', 'username provenance is required');
select results_eq(
  $$ select enumlabel::text collate "C"
     from pg_enum
     where enumtypid = 'public.username_provenance'::regtype
     order by enumsortorder $$,
  $$ values
       ('registration'::text collate "C"),
       ('manual_claim'::text collate "C"),
       ('admin_verified'::text collate "C"),
       ('legacy_inferred'::text collate "C"),
       ('social_provisional'::text collate "C") $$,
  'username provenance is a native public enum with the complete stable label set'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_username_provenance_claim_check'
  ),
  'username provenance and claimed-at state have a cross-field constraint'
);
select ok(
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and conname = 'profiles_username_provenance_claim_check')
    like '%username_claimed_at IS NOT NULL%'
  and
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and conname = 'profiles_username_provenance_claim_check')
    like '%username_claimed_at IS NULL%',
  'the cross-field constraint binds trusted origins to claimed markers and provisional origins to null markers'
);
select col_not_null('public', 'profiles', 'username', 'usernames are required');
select has_index('public', 'profiles', 'profiles_username_key', 'usernames have a dedicated index');
select index_is_unique('public', 'profiles', 'profiles_username_key', 'usernames are globally unique');
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_username_format_check'
  ),
  'usernames have a canonical format constraint'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_username_reserved_check'
  ),
  'reserved usernames are blocked by a database constraint'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'username', 'UPDATE'),
  'service role cannot bypass the audited username write paths'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'username_claimed_at', 'UPDATE'),
  'service role cannot directly rewrite the claimed marker'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'username_provenance', 'UPDATE'),
  'service role cannot directly rewrite username provenance'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'username', 'INSERT')
  and not has_column_privilege('service_role', 'public.profiles', 'username_claimed_at', 'INSERT')
  and not has_column_privilege('service_role', 'public.profiles', 'username_provenance', 'INSERT'),
  'service role cannot directly insert canonical username state'
);
select ok(
  has_column_privilege('service_role', 'public.profiles', 'display_name', 'UPDATE')
  and has_column_privilege('service_role', 'public.profiles', 'account_status', 'UPDATE'),
  'service role retains direct administration of non-username profile fields'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE'),
  'clients cannot directly rename their username'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'username_claimed_at', 'UPDATE'),
  'clients cannot directly mark a username as claimed'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'username_provenance', 'UPDATE'),
  'clients cannot directly rewrite username provenance'
);
select ok(
  not has_function_privilege('anon', 'private.normalize_username(text)', 'EXECUTE'),
  'anonymous clients cannot invoke the internal normalizer'
);
select ok(
  not has_function_privilege('authenticated', 'private.normalize_username(text)', 'EXECUTE'),
  'authenticated clients cannot invoke the internal normalizer'
);
select has_function('public', 'claim_username', array['text'], 'one-time username claim RPC is available');
select ok(
  has_function_privilege('authenticated', 'public.claim_username(text)', 'EXECUTE'),
  'authenticated clients can invoke the username claim RPC'
);
select ok(
  not has_function_privilege('anon', 'public.claim_username(text)', 'EXECUTE'),
  'anonymous clients cannot invoke the username claim RPC'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.claim_username(text)'::regprocedure),
  'username claims execute with the definer privileges needed for the protected columns'
);
select ok(
  (select prosrc like '%for update%' from pg_proc where oid = 'public.claim_username(text)'::regprocedure),
  'username claims serialize changes by locking the caller profile'
);
select has_function(
  'public', 'admin_verify_username', array['uuid', 'text', 'uuid', 'text', 'text'],
  'service role has an audited legacy username verification RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.admin_verify_username(uuid,text,uuid,text,text)',
    'EXECUTE'
  ),
  'service role can invoke username verification'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_verify_username(uuid,text,uuid,text,text)',
    'EXECUTE'
  ),
  'ordinary users cannot invoke admin username verification'
);
select has_column('private', 'device_claims', 'code_digest', 'device claims store only a digest'); -- 8
select hasnt_column('private', 'device_claims', 'claim_code', 'device claims never store a plaintext code'); -- 9
select is(
  (select confdeltype from pg_constraint where conname = 'devices_owner_id_fkey' and conrelid = 'public.devices'::regclass),
  'n'::"char",
  'deleting an account nulls device ownership instead of deleting inventory'
);
select has_index(
  'public', 'devices', 'devices_one_physical_per_owner_idx',
  'devices enforce one bound physical device per account'
);
select index_is_unique(
  'public', 'devices', 'devices_one_physical_per_owner_idx',
  'the physical-device ownership index is unique'
);
select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), true, 'profiles has RLS'); -- 10
select is((select relrowsecurity from pg_class where oid = 'public.devices'::regclass), true, 'devices has RLS'); -- 11
select is((select relrowsecurity from pg_class where oid = 'public.account_terminals'::regclass), true, 'terminals have RLS'); -- 12
select is((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), true, 'audit logs have RLS'); -- 13
select is((select relrowsecurity from pg_class where oid = 'private.device_claims'::regclass), true, 'private device claims have defense-in-depth RLS');
select has_index(
  'private', 'device_claims', 'device_claims_consumed_by_idx',
  'device claims index the consumed-by foreign key'
);
select ok(has_table_privilege('service_role', 'public.account_terminals', 'SELECT'), 'service role administers terminals'); -- 14
select ok(has_table_privilege('service_role', 'public.audit_logs', 'INSERT'), 'service role appends audit logs'); -- 15
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'UPDATE'), 'audit logs are append-only'); -- 16
select ok(has_table_privilege('service_role', 'public.audit_logs', 'SELECT'), 'service role can query audit logs through authorized Edge Functions');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'DELETE'), 'service role cannot delete audit logs');
select ok(
  not has_table_privilege('service_role', 'public.audit_logs', 'TRUNCATE')
  and not has_table_privilege('service_role', 'public.audit_logs', 'REFERENCES')
  and not has_table_privilege('service_role', 'public.audit_logs', 'TRIGGER')
  and not has_table_privilege('service_role', 'public.audit_logs', 'MAINTAIN'),
  'service role has no audit table privilege beyond select and insert'
);
select ok(
  not (
    has_table_privilege('anon', 'public.audit_logs', 'SELECT')
    or has_table_privilege('anon', 'public.audit_logs', 'INSERT')
    or has_table_privilege('anon', 'public.audit_logs', 'UPDATE')
    or has_table_privilege('anon', 'public.audit_logs', 'DELETE')
    or has_table_privilege('anon', 'public.audit_logs', 'TRUNCATE')
    or has_table_privilege('anon', 'public.audit_logs', 'REFERENCES')
    or has_table_privilege('anon', 'public.audit_logs', 'TRIGGER')
    or has_table_privilege('anon', 'public.audit_logs', 'MAINTAIN')
  ),
  'anonymous clients have no audit log table privileges'
);
select ok(
  not (
    has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
    or has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
    or has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
    or has_table_privilege('authenticated', 'public.audit_logs', 'DELETE')
    or has_table_privilege('authenticated', 'public.audit_logs', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.audit_logs', 'REFERENCES')
    or has_table_privilege('authenticated', 'public.audit_logs', 'TRIGGER')
    or has_table_privilege('authenticated', 'public.audit_logs', 'MAINTAIN')
  ),
  'ordinary authenticated users have no audit log table privileges'
);
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_logs'),
  0::bigint,
  'audit logs expose no authenticated RLS read policy'
);
select ok(
  has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'USAGE'),
  'service role retains the identity-sequence usage needed to append audit logs'
);
select ok(
  not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'SELECT')
  and not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'UPDATE'),
  'service role cannot inspect or advance the audit identity sequence outside inserts'
);
select ok(
  not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'USAGE')
  and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'SELECT')
  and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'UPDATE')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'USAGE')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'SELECT')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'UPDATE'),
  'client roles have no audit identity-sequence privileges'
);
select ok(has_table_privilege('service_role', 'private.device_claims', 'SELECT'), 'service role administers claims'); -- 17
select ok(
  has_function_privilege('service_role', 'public.admin_revoke_user_terminals(uuid,text)', 'EXECUTE'),
  'service role can revoke all terminals for an administered user'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_revoke_user_terminals(uuid,text)', 'EXECUTE'),
  'ordinary users cannot call the admin terminal revocation RPC'
);
select ok(
  has_function_privilege('service_role', 'public.admin_suspend_user_account(uuid,text,uuid,text,text)', 'EXECUTE'),
  'service role can atomically suspend a DOSO account'
);
select ok(
  not has_function_privilege('authenticated', 'public.admin_suspend_user_account(uuid,text,uuid,text,text)', 'EXECUTE'),
  'ordinary users cannot call the account suspension RPC'
);
select ok(
  has_function_privilege('service_role', 'public.admin_activate_user_account(uuid,text,uuid,text,text)', 'EXECUTE'),
  'service role can atomically activate a DOSO account'
);
select ok(
  has_function_privilege('service_role', 'public.admin_revoke_user_terminal(uuid,text,uuid,uuid,text,text)', 'EXECUTE'),
  'service role can revoke a target-owned terminal'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pilot@doso.test', crypt('StrongPass123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"doso_pilot","display_name":"DOSO Pilot"}'::jsonb, now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other@doso.test', crypt('StrongPass456', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"other_pilot","display_name":"Other Pilot"}'::jsonb, now(), now());

select results_eq(
  $$ select username from public.profiles
     where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
     order by id $$,
  $$ values ('doso_pilot'::text), ('other_pilot'::text) $$,
  'email registrations preserve their requested usernames'
);
select is(
  (select count(*) from public.profiles
   where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
     and username_claimed_at is not null),
  2::bigint,
  'valid explicit email-registration usernames are claimed immediately'
);
select results_eq(
  $$ select username_provenance::text
     from public.profiles
     where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
     order by id $$,
  $$ values ('registration'::text), ('registration'::text) $$,
  'explicit email-registration usernames record registration provenance'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'named@doso.test', crypt('StrongPass789', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":" Pilot_Name ","display_name":"Visual Pilot"}'::jsonb, now(), now()
);

select results_eq(
  $$ select username, display_name from public.profiles where id = '55555555-5555-4555-8555-555555555555' $$,
  $$ values ('pilot_name'::text, 'Visual Pilot'::text) $$,
  'email registration lowercases and trims a valid explicit username without replacing display name'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('99999999-9999-4999-8999-999999999999', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', null, null, now(),
   '{"provider":"apple","providers":["apple"]}'::jsonb,
   '{"username":"provider_name","full_name":"Apple Pilot"}'::jsonb, now(), now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', null, null, now(),
   '{"provider":"wechat","providers":["wechat"]}'::jsonb,
   '{"full_name":"WeChat Pilot"}'::jsonb, now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', null, null, now(),
   '{"provider":"qq","providers":["qq"]}'::jsonb,
   '{"full_name":"QQ Pilot"}'::jsonb, now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', null, null, now(),
   '{"provider":"apple","providers":["apple"]}'::jsonb,
   '{}'::jsonb, now(), now());

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'otp-pending@doso.test', crypt('StrongPass987', gen_salt('bf')), null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"username":"otp_pending"}'::jsonb, now(), now()
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('12345678-1234-4234-8234-1234567890ab', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'legacy-manual@doso.test', crypt('StrongPass654', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('87654321-4321-4321-8321-ba0987654321', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'legacy-admin@doso.test', crypt('StrongPass321', gen_salt('bf')), now(),
   '{"providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

-- These JWTs represent real Auth sessions. Terminal absence, revocation and
-- account suspension remain separate authorization boundaries below.
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','11111111-1111-4111-8111-111111111111',now(),now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','11111111-1111-4111-8111-111111111111',now(),now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','11111111-1111-4111-8111-111111111111',now(),now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','22222222-2222-4222-8222-222222222222',now(),now()),
  ('99999999-9999-4999-8999-999999999991','99999999-9999-4999-8999-999999999999',now(),now()),
  ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),now()),
  ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now(),now()),
  ('12345678-1234-4234-8234-1234567890ac','12345678-1234-4234-8234-1234567890ab',now(),now());

select results_eq(
  $$ select username_provenance::text, username_claimed_at is null
     from public.profiles
     where id in ('12345678-1234-4234-8234-1234567890ab', '87654321-4321-4321-8321-ba0987654321')
     order by id $$,
  $$ values ('legacy_inferred'::text, true), ('legacy_inferred'::text, true) $$,
  'email and unknown-provider accounts without explicit usernames remain legacy inferred'
);
select is(
  (select count(*) from public.profiles
   where username_claimed_at = created_at
     and username_provenance in ('registration', 'manual_claim', 'admin_verified')),
  0::bigint,
  'the old claimed-at equals created-at fingerprint is never retained as a trusted claimed provenance'
);
select is(
  (select count(distinct username) from public.profiles
   where id in ('12345678-1234-4234-8234-1234567890ab', '87654321-4321-4321-8321-ba0987654321')),
  2::bigint,
  'legacy inferred placeholders remain unique while awaiting confirmation'
);

select is(
  (select relrowsecurity from pg_class where oid = 'private.account_identities'::regclass),
  true,
  'the external identity projection has defense-in-depth RLS'
);
select ok(not has_table_privilege('anon', 'private.account_identities', 'SELECT'), 'anonymous users cannot read identity projections');
select ok(not has_table_privilege('authenticated', 'private.account_identities', 'SELECT'), 'authenticated users cannot read identity projections directly');
select ok(not has_table_privilege('service_role', 'private.account_identities', 'SELECT'), 'service role must use safe identity RPCs instead of reading projection internals');
select has_column('private', 'account_identities', 'provider_subject_hash', 'identity subjects are represented by a digest');
select hasnt_column('private', 'account_identities', 'provider_id', 'raw provider subjects are not stored in the DOSO projection');
select hasnt_column('private', 'account_identities', 'identity_data', 'provider identity payloads are not copied into the DOSO projection');
select hasnt_column('private', 'account_identities', 'provider_token', 'provider access tokens are not stored in the DOSO projection');
select has_function('public', 'list_my_login_methods', array[]::text[], 'users have a safe login-method inventory RPC');
select has_function('public', 'admin_list_user_identities', array['uuid'], 'service role has a safe user identity inventory RPC');
select has_function('public', 'admin_reconcile_user_identities', array['uuid'], 'service role can reconcile a user identity projection');
select ok(has_function_privilege('authenticated', 'public.list_my_login_methods()', 'EXECUTE'), 'authenticated users can list their own login methods');
select ok(not has_function_privilege('authenticated', 'public.admin_list_user_identities(uuid)', 'EXECUTE'), 'authenticated users cannot invoke the admin identity inventory');
select ok(not has_function_privilege('authenticated', 'public.admin_reconcile_user_identities(uuid)', 'EXECUTE'), 'authenticated users cannot invoke identity reconciliation');
select ok(has_function_privilege('service_role', 'public.admin_reconcile_user_identities(uuid)', 'EXECUTE'), 'service role can invoke identity reconciliation');
select is(
  (select string_agg(parameter_name, ',' order by ordinal_position)
   from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'list_my_login_methods_%'
     and parameter_mode = 'OUT'),
  'registry_id,provider_key,kind,email_verified,linked_at,provider_last_sign_in_at,last_observed_at,unlinked_at,status'::text,
  'the user identity RPC exposes the stable client contract'
);
select is(
  (select string_agg(parameter_name, ',' order by ordinal_position)
   from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'admin_list_user_identities_%'
     and parameter_mode = 'OUT'),
  'registry_id,provider_key,kind,email_verified,linked_at,provider_last_sign_in_at,last_observed_at,unlinked_at,status'::text,
  'the admin identity RPC exposes the same stable client contract'
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values
  ('d1111111-1111-4111-8111-111111111111', 'email-subject-pilot', '11111111-1111-4111-8111-111111111111',
   '{"sub":"email-subject-pilot","email":"pilot@doso.test","email_verified":false,"provider_token":"email-secret"}'::jsonb,
   'email', now(), now(), now()),
  ('d2222222-2222-4222-8222-222222222222', 'email-subject-other', '22222222-2222-4222-8222-222222222222',
   '{"sub":"email-subject-other","email":"other@doso.test","email_verified":true}'::jsonb,
   'email', now(), now(), now()),
  ('d9999999-9999-4999-8999-999999999999', 'apple-subject-001', '99999999-9999-4999-8999-999999999999',
   '{"sub":"apple-subject-001","email_verified":true,"provider_token":"apple-secret","provider_refresh_token":"apple-refresh-secret"}'::jsonb,
   'apple', now(), now(), now()),
  ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wechat-subject-001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '{"sub":"wechat-subject-001","email_verified":false,"access_token":"wechat-secret"}'::jsonb,
   'custom:wechat', now(), now(), now()),
  ('dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'qq-subject-001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '{"sub":"qq-subject-001","email_verified":false,"provider_token":"qq-secret"}'::jsonb,
   'custom:qq', now(), now(), now()),
  ('deeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'email-subject-otp', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   '{"sub":"email-subject-otp","email":"otp-pending@doso.test","email_verified":false}'::jsonb,
   'email', now(), now(), now());

select is((select count(*) from private.account_identities where user_id in (
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
)), 6::bigint, 'auth identity inserts create one DOSO projection per identity');
select results_eq(
  $$ select provider_key, private.external_identity_kind(provider_key)
     from private.account_identities
     where provider_key in ('apple', 'custom:wechat', 'custom:qq') order by provider_key $$,
  $$ values ('apple'::text, 'apple'::text), ('custom:qq'::text, 'qq'::text), ('custom:wechat'::text, 'wechat'::text) $$,
  'Apple, WeChat, and QQ identities retain stable provider keys and public kinds'
);
select ok(
  not exists (select 1 from private.account_identities where octet_length(provider_subject_hash) <> 32),
  'every provider subject is stored as a SHA-256 digest'
);
select ok(
  (select jsonb_agg(to_jsonb(ai))::text from private.account_identities ai
   where ai.user_id in ('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
    not like '%subject-001%',
  'raw Apple, WeChat, and QQ subjects never appear in the DOSO projection'
);
select ok(
  (select jsonb_agg(to_jsonb(ai))::text from private.account_identities ai)
    not like '%secret%',
  'provider tokens never appear in the DOSO projection'
);
select is(
  (select count(*) from public.audit_logs where action = 'identity.linked' and target_user_id in (
    '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
    '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  )),
  6::bigint,
  'new projections append one linked audit event per identity'
);
select ok(
  (select coalesce(jsonb_agg(metadata)::text, '') from public.audit_logs where action like 'identity.%') not like '%subject-001%',
  'identity audit metadata does not expose raw provider subjects'
);
select ok(
  (select coalesce(jsonb_agg(metadata)::text, '') from public.audit_logs where action like 'identity.%') not like '%secret%',
  'identity audit metadata does not expose provider tokens'
);
select lives_ok(
  $$ update auth.identities set last_sign_in_at = now() + interval '1 minute'
     where id = 'd9999999-9999-4999-8999-999999999999' $$,
  'ordinary provider timestamp refreshes keep auth available'
);
select is(
  (select count(*) from public.audit_logs where target_user_id = '99999999-9999-4999-8999-999999999999' and action like 'identity.%'),
  1::bigint,
  'timestamp refreshes do not create identity transition audit noise'
);
select lives_ok(
  $$ delete from auth.identities where id = 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'removing a WeChat auth identity does not interrupt Auth maintenance'
);
select is(
  (select case when unlinked_at is null then 'active' else 'unlinked' end from private.account_identities
   where provider_key = 'custom:wechat' and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'unlinked'::text,
  'removing a WeChat identity tombstones its projection'
);
select is(
  (select count(*) from public.audit_logs where target_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action = 'identity.unlinked'),
  1::bigint,
  'unlinking a WeChat identity is audited once'
);
select lives_ok(
  $$ insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ('daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'wechat-subject-001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       '{"sub":"wechat-subject-001","email_verified":false}'::jsonb, 'custom:wechat', now(), now(), now()) $$,
  'the same WeChat subject can be safely relinked after unlinking'
);
select is(
  (select case when unlinked_at is null then 'active' else 'unlinked' end from private.account_identities
   where provider_key = 'custom:wechat' and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'active'::text,
  'relinking restores the existing hash-only projection'
);
select is(
  (select count(*) from public.audit_logs where target_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action = 'identity.relinked'),
  1::bigint,
  'relinking a WeChat identity is audited once'
);
select lives_ok(
  $$ update auth.identities set user_id = '22222222-2222-4222-8222-222222222222'
     where id = 'd9999999-9999-4999-8999-999999999999' $$,
  'a projection conflict cannot take the Auth identity maintenance path offline'
);
select is(
  (select user_id from private.account_identities where provider_key = 'apple' and provider_subject_hash = private.external_identity_subject_hash('apple', 'apple-subject-001')),
  '99999999-9999-4999-8999-999999999999'::uuid,
  'a swallowed projection conflict cannot transfer the DOSO identity owner'
);
update auth.identities set user_id = '99999999-9999-4999-8999-999999999999'
where id = 'd9999999-9999-4999-8999-999999999999';
select is(
  (select email_verified from private.account_identities where user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  false,
  'an unconfirmed email identity is initially projected as unverified'
);
select throws_ok(
  $$ select * from public.admin_list_user_identities('99999999-9999-4999-8999-999999999999') $$,
  '42501', 'service_role_required',
  'ordinary database callers cannot use the service-role identity inventory'
);

create temporary table identity_reconcile_baseline as
select linked_at
from private.account_identities
where provider_key = 'apple'
  and user_id = '99999999-9999-4999-8999-999999999999';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select results_eq(
  $$ select provider_key, kind, email_verified, status
     from public.admin_list_user_identities('99999999-9999-4999-8999-999999999999') $$,
  $$ values ('apple'::text, 'apple'::text, true, 'active'::text) $$,
  'the admin RPC returns only the safe Apple login-method summary'
);
select ok(
  (select jsonb_agg(to_jsonb(method))::text
   from public.admin_list_user_identities('99999999-9999-4999-8999-999999999999') method)
    not like '%subject%' and
  (select jsonb_agg(to_jsonb(method))::text
   from public.admin_list_user_identities('99999999-9999-4999-8999-999999999999') method)
    not like '%token%',
  'admin identity inventory exposes neither provider subjects nor tokens'
);
reset role;

insert into private.account_identities (
  provider_key, provider_subject_hash, auth_identity_id, user_id,
  email_verified, linked_at, provider_last_sign_in_at, last_observed_at
) values (
  'custom:qq',
  private.external_identity_subject_hash('custom:qq', 'qq-missing-from-auth'),
  'd9999999-9999-4999-8999-999999999998',
  '99999999-9999-4999-8999-999999999999',
  false,
  now() - interval '1 day',
  null,
  now() - interval '1 day'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select provider_last_sign_in_at is null
   from public.admin_list_user_identities('99999999-9999-4999-8999-999999999999')
   where provider_key = 'custom:qq'),
  true,
  'the canonical identity contract preserves a null provider last-sign-in timestamp'
);
select ok(
  (select bool_and(registry_id is not null)
   from public.admin_list_user_identities('99999999-9999-4999-8999-999999999999')),
  'the canonical identity contract exposes stable non-null registry identifiers'
);
select is(
  public.admin_reconcile_user_identities('99999999-9999-4999-8999-999999999999'),
  1,
  'service-role reconciliation rebuilds a user projection from Auth truth'
);
reset role;
select is(
  (select linked_at from private.account_identities
   where provider_key = 'apple' and user_id = '99999999-9999-4999-8999-999999999999'),
  (select linked_at from identity_reconcile_baseline),
  'reconciliation preserves linked_at for an identity that still exists in Auth'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.admin_reconcile_user_identities('99999999-9999-4999-8999-999999999999'),
  1,
  'repeating reconciliation remains idempotent'
);
reset role;
select is(
  (select linked_at from private.account_identities
   where provider_key = 'apple' and user_id = '99999999-9999-4999-8999-999999999999'),
  (select linked_at from identity_reconcile_baseline),
  'repeated reconciliation still preserves the original linked_at'
);
select is(
  (select count(*) from private.account_identities
   where user_id = '99999999-9999-4999-8999-999999999999'
     and provider_key = 'apple' and unlinked_at is null),
  1::bigint,
  'reconciliation leaves the Auth-backed Apple projection active'
);
select is(
  (select count(*) from private.account_identities
   where user_id = '99999999-9999-4999-8999-999999999999'
     and provider_key = 'custom:qq' and unlinked_at is not null
     and unlink_reason = 'reconciliation_missing_from_auth'),
  1::bigint,
  'reconciliation tombstones only a projection missing from Auth'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select results_eq(
  $$ select provider_key, provider_last_sign_in_at, status
     from public.admin_list_user_identities('99999999-9999-4999-8999-999999999999')
     where provider_key = 'custom:qq' $$,
  $$ values ('custom:qq'::text, null::timestamptz, 'unlinked'::text) $$,
  'the admin identity contract returns exact null and unlinked values for tombstones'
);
reset role;
select is(
  (select count(*) from public.audit_logs
   where target_user_id = '99999999-9999-4999-8999-999999999999'
     and action = 'identity.unlinked'
     and resource_id = (
       select id::text from private.account_identities
       where provider_key = 'custom:qq'
         and user_id = '99999999-9999-4999-8999-999999999999'
     )),
  1::bigint,
  'a reconciliation tombstone emits one safe unlink audit event'
);
select is(
  (select count(*) from public.audit_logs
   where target_user_id = '99999999-9999-4999-8999-999999999999'
     and action = 'identity.reconciled'),
  2::bigint,
  'each reconciliation attempt emits an operational success audit event'
);
select ok(
  (select jsonb_agg(metadata)::text from public.audit_logs
   where target_user_id = '99999999-9999-4999-8999-999999999999'
     and action in ('identity.reconciled', 'identity.unlinked'))
    not like '%qq-missing-from-auth%' and
  (select jsonb_agg(metadata)::text from public.audit_logs
   where target_user_id = '99999999-9999-4999-8999-999999999999'
     and action in ('identity.reconciled', 'identity.unlinked'))
    not like '%token%',
  'reconciliation audit metadata exposes neither provider subjects nor tokens'
);
delete from private.account_identities
where provider_key = 'custom:qq'
  and user_id = '99999999-9999-4999-8999-999999999999';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select email_verified from public.admin_list_user_identities('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')),
  false,
  'the admin inventory reports an email login as unverified before OTP confirmation'
);
reset role;
select lives_ok(
  $$ update auth.users set email_confirmed_at = now() where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' $$,
  'email OTP confirmation can update Auth without requiring identity payload mutation'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select email_verified from public.admin_list_user_identities('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')),
  true,
  'the admin inventory derives email verification from current Auth confirmation state'
);
reset role;

select results_eq(
  $$ select email, username, display_name, username_claimed_at is null, username_provenance::text
     from public.profiles where id = '99999999-9999-4999-8999-999999999999' $$,
  $$ values (''::text, 'user_999999999999'::text, 'Apple Pilot'::text, true, 'social_provisional'::text) $$,
  'social identities without email receive an unclaimed provisional username even when provider metadata suggests one'
);
select lives_ok(
  $$ update auth.users
     set raw_user_meta_data = '{"username":"metadata_rename","full_name":"Apple Updated"}'::jsonb
     where id = '99999999-9999-4999-8999-999999999999' $$,
  'later social metadata updates do not claim a username'
);
select results_eq(
  $$ select username, display_name, username_claimed_at is null, username_provenance::text
     from public.profiles where id = '99999999-9999-4999-8999-999999999999' $$,
  $$ values ('user_999999999999'::text, 'Apple Updated'::text, true, 'social_provisional'::text) $$,
  'later social metadata updates preserve username, provenance, and unclaimed state'
);

insert into public.account_terminals (user_id, auth_session_id, installation_id, platform, device_label)
values
  ('99999999-9999-4999-8999-999999999999', '99999999-9999-4999-8999-999999999991', 'claim-apple', 'ios', 'Claim Apple'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'claim-wechat', 'android', 'Claim WeChat'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'claim-qq', 'android', 'Claim QQ'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'claim-apple-invalid', 'ios', 'Claim Apple Invalid'),
  ('12345678-1234-4234-8234-1234567890ab', '12345678-1234-4234-8234-1234567890ac', 'claim-legacy', 'web', 'Claim Legacy');

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select public.admin_verify_username(
       '11111111-1111-4111-8111-111111111111', 'admin',
       '87654321-4321-4321-8321-ba0987654321', 'reviewed', 'verify-legacy-1'
     ) $$,
  '42501', 'service_role_required',
  'ordinary database callers cannot invoke admin username verification'
);
create temporary table admin_username_baseline as
select username
from public.profiles
where id = '87654321-4321-4321-8321-ba0987654321';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.admin_verify_username(
    '11111111-1111-4111-8111-111111111111', 'admin',
    '87654321-4321-4321-8321-ba0987654321', 'reviewed', 'verify-legacy-1'
  ),
  'user_876543214321'::text,
  'admin verification confirms an unchanged legacy inferred username'
);
select is(
  public.admin_verify_username(
    '11111111-1111-4111-8111-111111111111', 'admin',
    '87654321-4321-4321-8321-ba0987654321', 'reviewed again', 'verify-legacy-2'
  ),
  'user_876543214321'::text,
  'repeating admin verification is idempotent'
);
select is(
  (select count(*) from public.audit_logs
   where action = 'username.admin_verified'
     and target_user_id = '87654321-4321-4321-8321-ba0987654321'),
  1::bigint,
  'idempotent admin verification does not duplicate its audit event'
);
select is(
  (select metadata ->> 'requestId' from public.audit_logs
   where action = 'username.admin_verified'
     and target_user_id = '87654321-4321-4321-8321-ba0987654321'),
  'verify-legacy-1'::text,
  'admin username verification writes correlated audit metadata once'
);
select throws_ok(
  $$ select public.admin_verify_username(
       '11111111-1111-4111-8111-111111111111', 'admin',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'not legacy', 'verify-social'
     ) $$,
  'P0001', 'username_not_admin_verifiable',
  'admin verification cannot promote a social provisional username'
);
reset role;
select results_eq(
  $$ select username, username_provenance::text, username_claimed_at is not null
     from public.profiles where id = '87654321-4321-4321-8321-ba0987654321' $$,
  $$ select username, 'admin_verified'::text, true from admin_username_baseline $$,
  'admin verification preserves the username and records trusted claimed provenance'
);
select throws_ok(
  $$ update public.profiles
     set username_provenance = 'legacy_inferred', username_claimed_at = null
     where id = '87654321-4321-4321-8321-ba0987654321' $$,
  'P0001', 'username_provenance_transition_invalid',
  'a claimed username cannot roll back to an inferred state'
);
select throws_ok(
  $$ update public.profiles
     set username = 'admin_side_rename'
     where id = '87654321-4321-4321-8321-ba0987654321' $$,
  'P0001', 'username_provenance_transition_invalid',
  'an admin-verified username cannot be renamed by direct table mutation'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated","session_id":"99999999-9999-4999-8999-999999999991"}', true);
select results_eq(
  $$ select provider_key, kind, email_verified, status from public.list_my_login_methods() $$,
  $$ values ('apple'::text, 'apple'::text, true, 'active'::text) $$,
  'a signed-in user sees only their own active Apple login method'
);
select ok(
  (select bool_and(registry_id is not null and provider_last_sign_in_at is not null)
   from public.list_my_login_methods()),
  'the caller identity contract exposes canonical registry and provider sign-in fields'
);
select ok(
  (select jsonb_agg(to_jsonb(method))::text from public.list_my_login_methods() method)
    not like '%subject%' and
  (select jsonb_agg(to_jsonb(method))::text from public.list_my_login_methods() method)
    not like '%token%',
  'the user login-method inventory exposes neither provider subjects nor tokens'
);
select is(public.claim_username(' Social_Pilot '), 'social_pilot', 'an authenticated social user can claim a normalized valid username once');
select ok(
  (select username_claimed_at is not null from public.profiles where id = '99999999-9999-4999-8999-999999999999'),
  'a successful claim records the durable server-owned marker'
);
select is(
  (select username_provenance::text from public.profiles where id = '99999999-9999-4999-8999-999999999999'),
  'manual_claim'::text,
  'a social provisional claim transitions to manual claim provenance'
);
select is(public.claim_username('SOCIAL_PILOT'), 'social_pilot', 'repeating the same claim is idempotent');
select throws_ok(
  $$ select public.claim_username('second_name') $$,
  'P0001', 'username_already_claimed',
  'a claimed profile cannot rename itself through the one-time RPC'
);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","session_id":"daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}', true);
select throws_ok(
  $$ select public.claim_username('abc-def') $$,
  '22023', 'username_invalid',
  'invalid characters are rejected instead of silently rewritten'
);
select throws_ok(
  $$ select public.claim_username('ADMIN') $$,
  '22023', 'username_reserved',
  'reserved usernames return a stable domain error'
);
select throws_ok(
  $$ select public.claim_username('social_pilot') $$,
  'P0001', 'username_taken',
  'a duplicate or racing claim maps uniqueness failure to a stable domain error'
);

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","session_id":"dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"}', true);
select is(public.claim_username('queue_pilot'), 'queue_pilot', 'another unclaimed profile can claim a distinct username');

select set_config('request.jwt.claims', '{"sub":"12345678-1234-4234-8234-1234567890ab","role":"authenticated","session_id":"12345678-1234-4234-8234-1234567890ac"}', true);
select is(
  public.claim_username('legacy_confirmed'),
  'legacy_confirmed'::text,
  'a legacy inferred profile can confirm a username through the one-time claim RPC'
);
select is(
  (select username_provenance::text from public.profiles where id = '12345678-1234-4234-8234-1234567890ab'),
  'manual_claim'::text,
  'a legacy inferred confirmation transitions to manual claim provenance'
);

reset role;

select throws_ok(
  $$ insert into auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values (
       '66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'duplicate@doso.test', crypt('StrongPass789', gen_salt('bf')),
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"username":"PILOT_NAME"}'::jsonb, now(), now()
     ) $$,
  '23505', null,
  'case variants cannot bypass global username uniqueness'
);

select throws_ok(
  $$ insert into auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values (
       '77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'reserved@doso.test', crypt('StrongPass789', gen_salt('bf')),
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"username":"ADMIN"}'::jsonb, now(), now()
     ) $$,
  '22023', 'username is reserved',
  'reserved usernames are rejected during registration'
);

select throws_ok(
  $$ insert into auth.users (
       id, instance_id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values (
       '88888888-8888-4888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'short@doso.test', crypt('StrongPass789', gen_salt('bf')),
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"username":"x"}'::jsonb, now(), now()
     ) $$,
  '22023', 'username must be 3-24 characters using only a-z, 0-9, or underscore',
  'too-short usernames are rejected during registration'
);

select lives_ok(
  $$ update auth.users
     set raw_user_meta_data = '{"display_name":"Updated Visual"}'::jsonb
     where id = '55555555-5555-4555-8555-555555555555' $$,
  'metadata updates without a username preserve the canonical username'
);

select results_eq(
  $$ select username, display_name from public.profiles where id = '55555555-5555-4555-8555-555555555555' $$,
  $$ values ('pilot_name'::text, 'Updated Visual'::text) $$,
  'username remains stable when compatible display metadata changes'
);

select lives_ok(
  $$ update auth.users
     set raw_user_meta_data = '{"username":"renamed_by_client","display_name":"Updated Again"}'::jsonb
     where id = '55555555-5555-4555-8555-555555555555' $$,
  'user-editable auth metadata cannot rename an allocated username'
);

select results_eq(
  $$ select username, display_name, username_provenance::text, username_claimed_at is not null
     from public.profiles where id = '55555555-5555-4555-8555-555555555555' $$,
  $$ values ('pilot_name'::text, 'Updated Again'::text, 'registration'::text, true) $$,
  'canonical username, provenance, and claim marker remain immutable while display metadata can change'
);

select results_eq(
  $$ select email, app_role, account_status from public.profiles where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values ('pilot@doso.test'::text, 'user'::text, 'active'::text) $$,
  'new accounts have safe defaults' -- 18
);

insert into public.devices (
  id, owner_id, model_code, display_name, category, environment, serial_number,
  connection_status, safety_lock, alerts_enabled, battery_percent, is_demo
)
values
  ('11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111111',
   'thunder-01', 'Bound THUNDER', '四足', '室外', 'DOSO-PHYSICAL-001', 'online', true, true, 88, false),
  ('22222222-2222-4222-8222-222222222201', '22222222-2222-4222-8222-222222222222',
   'scout', 'Other SCOUT', '四足', '室内', null, 'offline', true, true, null, true),
  ('33333333-3333-4333-8333-333333333301', null,
   'thunder-pro', 'Unbound THUNDER', '四足', '室外', 'DOSO-CLAIM-001', 'offline', true, true, null, false);

select lives_ok(
  $$ select public.rotate_device_claim(
       '33333333-3333-4333-8333-333333333301',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
       now() + interval '10 minutes'
     ) $$,
  'trusted backend can rotate a digest-only device claim'
);
select is(
  (public.claim_device_with_digest(
    '22222222-2222-4222-8222-222222222222', 'DOSO-CLAIM-001',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  )).id,
  null::uuid,
  'an invalid claim digest does not bind a physical device'
);
select is(
  (public.claim_device_with_digest(
    '22222222-2222-4222-8222-222222222222', 'DOSO-CLAIM-001',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )).owner_id,
  '22222222-2222-4222-8222-222222222222'::uuid,
  'a valid digest atomically binds the physical device'
);
insert into public.devices (
  id, owner_id, model_code, display_name, category, environment, serial_number,
  connection_status, safety_lock, alerts_enabled, is_demo
)
values (
  '44444444-4444-4444-8444-444444444401', null, 'thunder-02',
  'Second physical device', '四足', '室外', 'DOSO-CLAIM-002',
  'offline', true, true, false
);
do $$
begin
  perform public.rotate_device_claim(
    '44444444-4444-4444-8444-444444444401',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    now() + interval '10 minutes'
  );
end;
$$;
select throws_ok(
  $$ select public.claim_device_with_digest(
       '22222222-2222-4222-8222-222222222222', 'DOSO-CLAIM-002',
       'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
     ) $$,
  'P0001', 'account already has a bound physical device',
  'a second physical device claim is rejected with a stable domain error'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}', true);

select is((select count(*) from public.profiles), 0::bigint, 'unregistered sessions cannot access account data'); -- 19
select lives_ok(
  $$ select public.register_account_terminal('install-a', 'android', 'Pixel 5', '1.2.0', 'DOSO/1.2.0') $$,
  'legacy sessions can bootstrap a terminal' -- 20
);
select is((select count(*) from public.account_terminals), 1::bigint, 'current terminal is visible'); -- 21
select results_eq('select email from public.profiles', $$ values ('pilot@doso.test'::text) $$, 'active session reads own profile'); -- 22
select is(
  public.claim_username('DOSO_PILOT'),
  'doso_pilot'::text,
  'an explicit registration claim is idempotent for the same canonical value'
);
select throws_ok(
  $$ select public.claim_username('registration_rename') $$,
  'P0001', 'username_already_claimed',
  'an explicit registration cannot be renamed through the claim RPC'
);
select results_eq('select display_name from public.devices', $$ values ('Bound THUNDER'::text) $$, 'active session sees only own devices'); -- 23
select lives_ok(
  $$ update public.profiles
     set display_name = 'Pilot Updated', avatar_url = 'https://cdn.doso.test/avatar.png'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'authenticated users can update allowed profile presentation fields'
);
select results_eq(
  $$ select username, display_name, avatar_url from public.profiles $$,
  $$ values ('doso_pilot'::text, 'Pilot Updated'::text, 'https://cdn.doso.test/avatar.png'::text) $$,
  'profile presentation updates preserve the immutable username'
);
select throws_ok(
  $$ update public.profiles
     set username = 'renamed_by_client'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', 'permission denied for table profiles',
  'authenticated users cannot directly rename their canonical username'
);

select lives_ok(
  $$ insert into public.devices (owner_id, model_code, display_name, category, environment, is_demo)
     values ('11111111-1111-4111-8111-111111111111', 'scout', 'Demo SCOUT', '四足', '室内', true) $$,
  'users may create a constrained onboarding demo' -- 24
);
select throws_ok(
  $$ insert into public.devices (owner_id, model_code, display_name, category, environment, serial_number, is_demo)
     values ('11111111-1111-4111-8111-111111111111', 'scout', 'Fake physical', '四足', '室内', 'FORGED', false) $$,
  '42501', 'new row violates row-level security policy for table "devices"',
  'clients cannot create physical devices' -- 25
);
select throws_ok(
  $$ insert into public.devices (owner_id, model_code, display_name, category, environment, is_demo)
     values ('22222222-2222-4222-8222-222222222222', 'scout', 'Cross owner', '四足', '室内', true) $$,
  '42501', 'new row violates row-level security policy for table "devices"',
  'clients cannot create devices for other users' -- 26
);
select lives_ok(
  $$ update public.devices set display_name = 'Renamed', alerts_enabled = false where id = '11111111-1111-4111-8111-111111111101' $$,
  'clients can update presentation preferences' -- 27
);
select results_eq(
  $$ update public.devices set display_name = 'Hijacked' where owner_id = '22222222-2222-4222-8222-222222222222' returning id $$,
  $$ select null::uuid where false $$,
  'clients cannot update another users devices'
);
select throws_ok(
  $$ update public.devices set safety_lock = false where id = '11111111-1111-4111-8111-111111111101' $$,
  '42501', 'permission denied for table devices', 'clients cannot update safety state' -- 28
);
select throws_ok(
  $$ update public.devices set battery_percent = 1 where id = '11111111-1111-4111-8111-111111111101' $$,
  '42501', 'permission denied for table devices', 'clients cannot update telemetry' -- 29
);
select results_eq(
  $$ delete from public.devices where id = '11111111-1111-4111-8111-111111111101' returning id $$,
  $$ select null::uuid where false $$,
  'clients cannot delete physical devices' -- 30
);
select results_eq(
  $$ delete from public.devices where display_name = 'Demo SCOUT' returning display_name $$,
  $$ values ('Demo SCOUT'::text) $$,
  'clients can delete onboarding demos' -- 31
);
select throws_ok(
  $$ update public.profiles set app_role = 'admin' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', 'permission denied for table profiles', 'clients cannot promote their role' -- 32
);
select throws_ok(
  $$ update public.profiles set account_status = 'active' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', 'permission denied for table profiles', 'clients cannot change account status'
);
select throws_ok(
  $$ update public.account_terminals set revoked_at = null $$,
  '42501', 'permission denied for table account_terminals', 'clients cannot directly edit terminal security records'
);
select throws_ok(
  $$ insert into public.audit_logs (actor_user_id, action) values ('11111111-1111-4111-8111-111111111111', 'forged') $$,
  '42501', 'permission denied for table audit_logs', 'clients cannot forge audit logs' -- 33
);
select lives_ok('select public.heartbeat_current_terminal()', 'current terminal can heartbeat'); -- 34

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}', true);
select lives_ok(
  $$ select public.register_account_terminal('install-b', 'web', 'Chrome', '1.2.0', 'Chrome') $$,
  'second session can register' -- 35
);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}', true);
select is((select count(*) from public.account_terminals), 2::bigint, 'user can list all own terminals'); -- 36
select is(
  public.revoke_account_terminal((select id from public.account_terminals where installation_id = 'install-b'), 'user_request'),
  1, 'user can revoke a specific terminal' -- 37
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}', true);
select is((select count(*) from public.profiles), 0::bigint, 'revocation immediately blocks protected data'); -- 38
select throws_ok(
  'select public.heartbeat_current_terminal()', 'P0001', 'current session is not active',
  'revoked terminals cannot heartbeat' -- 39
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"}', true);
select lives_ok(
  $$ select public.register_account_terminal('install-c', 'ios', 'iPhone', '1.2.0', 'DOSO iOS') $$,
  'third session can register' -- 40
);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}', true);
select is(public.revoke_other_terminals('security_review'), 1, 'user can revoke every other active terminal'); -- 41
select is(public.revoke_current_terminal('logout'), 1, 'user can revoke the current terminal'); -- 42
select is((select count(*) from public.profiles), 0::bigint, 'current revocation immediately blocks protected data'); -- 43

reset role;
insert into public.audit_logs (actor_user_id, target_user_id, action, resource_type)
values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'test.append', 'test');
select is((select count(*) from public.audit_logs where action = 'test.append'), 1::bigint, 'trusted backend can append audit records'); -- 44

insert into public.account_terminals (
  user_id, auth_session_id, installation_id, platform, device_label
) values (
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'admin-test-terminal', 'web', 'Admin test browser'
);
select is(
  public.admin_suspend_user_account(
    '11111111-1111-4111-8111-111111111111', 'admin',
    '22222222-2222-4222-8222-222222222222', 'security incident', 'request-suspend'
  ),
  1,
  'admin suspension revokes active terminals in the same transaction'
);
select is(
  (select account_status from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'suspended'::text,
  'admin suspension blocks DOSO profile access'
);
select is(
  (select metadata->>'requestId' from public.audit_logs where action = 'user.suspended' order by id desc limit 1),
  'request-suspend'::text,
  'admin suspension writes correlated audit metadata atomically'
);
select lives_ok(
  $$ select public.admin_activate_user_account(
       '11111111-1111-4111-8111-111111111111', 'admin',
       '22222222-2222-4222-8222-222222222222', 'review complete', 'request-activate'
     ) $$,
  'admin activation succeeds after the Auth unban step'
);
select is(
  (select account_status from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'active'::text,
  'admin activation enables DOSO only through the transaction RPC'
);
insert into public.account_terminals (
  user_id, auth_session_id, installation_id, platform, device_label
) values (
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
  'admin-revoke-terminal', 'ios', 'Admin revoke iPhone'
);
select is(
  public.admin_revoke_user_terminal(
    '11111111-1111-4111-8111-111111111111', 'admin',
    '22222222-2222-4222-8222-222222222222',
    (select id from public.account_terminals where installation_id = 'admin-revoke-terminal'),
    'lost device', 'request-terminal-revoke'
  ),
  1,
  'admin can revoke a terminal owned by the target user with audit'
);
select throws_ok(
  $$ select public.admin_revoke_user_terminal(
       '11111111-1111-4111-8111-111111111111', 'admin',
       '11111111-1111-4111-8111-111111111111',
       (select id from public.account_terminals where installation_id = 'admin-revoke-terminal'),
       'cross-user attempt', 'request-wrong-owner'
     ) $$,
  'P0001', 'terminal does not belong to user',
  'admin terminal revocation validates target ownership'
);

update public.profiles set account_status = 'suspended', suspended_at = now(), suspension_reason = 'test'
where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"}', true);
select throws_ok(
  $$ select public.register_account_terminal('install-suspended', 'android', 'Blocked', '1.2.0', null) $$,
  'P0001', 'account is not active', 'suspended accounts cannot bootstrap terminals' -- 45
);

reset role;
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
select is(
  (select count(*) from private.account_identities where user_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'deleting an Auth user removes its private identity projections'
);
select is(
  (select count(*) from public.devices where serial_number = 'DOSO-CLAIM-001'),
  1::bigint,
  'physical device inventory survives account deletion'
);
select is(
  (select owner_id from public.devices where serial_number = 'DOSO-CLAIM-001'),
  null::uuid,
  'deleted account ownership is cleared from retained physical inventory'
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select public.register_account_terminal('anon', 'web', 'Anonymous', null, null) $$,
  '42501', 'permission denied for function register_account_terminal',
  'anonymous users cannot register terminals' -- 46
);
select throws_ok(
  $$ select public.claim_username('anonymous_user') $$,
  '42501', 'permission denied for function claim_username',
  'anonymous users cannot claim usernames'
);

select * from finish();
rollback;
