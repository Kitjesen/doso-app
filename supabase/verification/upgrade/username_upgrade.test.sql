begin;

do $sentinel$
begin
  if pg_catalog.to_regclass('private.doso_upgrade_harness_sentinel') is null then
    raise exception using
      errcode = 'P0001',
      message = 'upgrade_harness_sentinel_required';
  end if;

  if not exists (
    select 1
    from private.doso_upgrade_harness_sentinel
    where scenario = 'internal_pre_g002_corrective'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'upgrade_harness_scenario_mismatch';
  end if;
end;
$sentinel$;

create extension if not exists pgtap with schema extensions;
select plan(67);

select col_not_null(
  'public', 'profiles', 'username_provenance',
  'the upgrade makes username provenance mandatory'
); -- 1

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
  'the upgrade installs the complete stable provenance vocabulary'
); -- 2

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_username_provenance_claim_check'
  ),
  'the upgrade installs the provenance and claim-marker consistency constraint'
); -- 3

select is(
  (select count(*) from public.profiles
   where id in (
     '71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002',
     '73000000-0000-4000-8000-000000000003', '74000000-0000-4000-8000-000000000004',
     '75000000-0000-4000-8000-000000000005', '76000000-0000-4000-8000-000000000006',
     '77000000-0000-4000-8000-000000000007', '78000000-0000-4000-8000-000000000008'
   )),
  8::bigint,
  'the upgrade preserves every seeded profile'
); -- 4

select results_eq(
  $$ select id, username from public.profiles
     where id in (
       '71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002',
       '73000000-0000-4000-8000-000000000003', '74000000-0000-4000-8000-000000000004',
       '75000000-0000-4000-8000-000000000005', '76000000-0000-4000-8000-000000000006',
       '77000000-0000-4000-8000-000000000007', '78000000-0000-4000-8000-000000000008'
     ) order by id $$,
  $$ values
       ('71000000-0000-4000-8000-000000000001'::uuid, 'fingerprint_name'::text),
       ('72000000-0000-4000-8000-000000000002'::uuid, 'registration_seed'::text),
       ('73000000-0000-4000-8000-000000000003'::uuid, 'manual_seed'::text),
       ('74000000-0000-4000-8000-000000000004'::uuid, 'social_seed'::text),
       ('75000000-0000-4000-8000-000000000005'::uuid, 'legacy_null'::text),
       ('76000000-0000-4000-8000-000000000006'::uuid, 'social_claimed'::text),
       ('77000000-0000-4000-8000-000000000007'::uuid, 'social_fingerprint'::text),
       ('78000000-0000-4000-8000-000000000008'::uuid, 'collision_waiter'::text) $$,
  'the upgrade never renames an existing canonical username'
); -- 5

select results_eq(
  $$ select display_name from public.profiles
     where id in (
       '71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002',
       '73000000-0000-4000-8000-000000000003', '74000000-0000-4000-8000-000000000004',
       '75000000-0000-4000-8000-000000000005', '76000000-0000-4000-8000-000000000006',
       '77000000-0000-4000-8000-000000000007', '78000000-0000-4000-8000-000000000008'
     ) order by id $$,
  $$ values
       ('Fingerprint Legacy'::text), ('Registration Seed'::text),
       ('Manual Seed'::text), ('Apple Provisional'::text),
       ('Legacy Null'::text), ('Social Previously Claimed'::text),
       ('Social Fingerprint'::text), ('Collision Waiter'::text) $$,
  'the upgrade preserves profile presentation data'
); -- 6

select results_eq(
  $$ select username_provenance::text from public.profiles
     where id in ('71000000-0000-4000-8000-000000000001', '77000000-0000-4000-8000-000000000007')
     order by id $$,
  $$ values ('legacy_inferred'::text), ('legacy_inferred'::text) $$,
  'claimed-at equals created-at fingerprints are classified as legacy inferred regardless of provider metadata'
); -- 7

select is(
  (select count(*) from public.profiles
   where id in ('71000000-0000-4000-8000-000000000001', '77000000-0000-4000-8000-000000000007')
     and username_claimed_at is null),
  2::bigint,
  'legacy backfill fingerprints lose only their false claim markers'
); -- 8

select is(
  (select username_provenance::text from public.profiles where id = '72000000-0000-4000-8000-000000000002'),
  'registration'::text,
  'an explicit matching email username is classified as registration provenance'
); -- 9

select is(
  (select username_claimed_at from public.profiles where id = '72000000-0000-4000-8000-000000000002'),
  '2026-01-02 00:05:00+00'::timestamptz,
  'the registration claim timestamp is preserved exactly'
); -- 10

select results_eq(
  $$ select username_provenance::text from public.profiles
     where id in ('73000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000006')
     order by id $$,
  $$ values ('manual_claim'::text), ('manual_claim'::text) $$,
  'non-fingerprint claimed rows are classified as manual claims even across provider kinds'
); -- 11

select results_eq(
  $$ select username_claimed_at from public.profiles
     where id in ('73000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000006')
     order by id $$,
  $$ values ('2026-01-03 00:06:00+00'::timestamptz), ('2026-01-06 00:07:00+00'::timestamptz) $$,
  'manual claim timestamps survive the upgrade unchanged'
); -- 12

select results_eq(
  $$ select username_provenance::text from public.profiles
     where id in ('74000000-0000-4000-8000-000000000004', '78000000-0000-4000-8000-000000000008')
     order by id $$,
  $$ values ('social_provisional'::text), ('social_provisional'::text) $$,
  'unclaimed social accounts are classified as social provisional'
); -- 13

select is(
  (select count(*) from public.profiles
   where id in ('74000000-0000-4000-8000-000000000004', '78000000-0000-4000-8000-000000000008')
     and username_claimed_at is null),
  2::bigint,
  'social provisional accounts remain unclaimed after migration'
); -- 14

select is(
  (select username_provenance::text from public.profiles where id = '75000000-0000-4000-8000-000000000005'),
  'legacy_inferred'::text,
  'an unclaimed email account without explicit username evidence is classified as legacy inferred'
); -- 15

select is(
  (select username_claimed_at from public.profiles where id = '75000000-0000-4000-8000-000000000005'),
  null::timestamptz,
  'an unclaimed legacy account keeps a null claim marker'
); -- 16

select is(
  (select count(*) from public.profiles
   where (username_provenance in ('registration', 'manual_claim', 'admin_verified') and username_claimed_at is null)
      or (username_provenance in ('legacy_inferred', 'social_provisional') and username_claimed_at is not null)),
  0::bigint,
  'the upgraded data contains no provenance and claim-marker contradictions'
); -- 17

select index_is_unique(
  'public', 'profiles', 'profiles_username_key',
  'global username uniqueness remains enforced after upgrade'
); -- 18

select is(
  (select string_agg(parameter_name, ',' order by ordinal_position)
   from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'list_my_login_methods_%'
     and parameter_mode = 'OUT'),
  'registry_id,provider_key,kind,email_verified,linked_at,provider_last_sign_in_at,last_observed_at,unlinked_at,status'::text,
  'the caller login-method RPC exposes the exact canonical column order'
); -- 19

select is(
  (select string_agg(parameter_name, ',' order by ordinal_position)
   from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'admin_list_user_identities_%'
     and parameter_mode = 'OUT'),
  'registry_id,provider_key,kind,email_verified,linked_at,provider_last_sign_in_at,last_observed_at,unlinked_at,status'::text,
  'the admin login-method RPC exposes the same canonical column order'
); -- 20

select is(
  (select string_agg(udt_name, ',' order by ordinal_position)
   from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'list_my_login_methods_%'
     and parameter_mode = 'OUT'),
  'uuid,text,text,bool,timestamptz,timestamptz,timestamptz,timestamptz,text'::text,
  'the canonical caller RPC retains exact output types and null-capable timestamp types'
); -- 21

select is(
  (select count(*) from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like any (array['list_my_login_methods_%', 'admin_list_user_identities_%'])
     and parameter_mode = 'OUT'
     and parameter_name in ('id', 'last_sign_in_at')),
  0::bigint,
  'legacy ambiguous identity output names are absent after upgrade'
); -- 22

select ok(
  has_function_privilege('authenticated', 'public.list_my_login_methods()', 'EXECUTE'),
  'authenticated users retain access to their own login-method inventory'
); -- 23

select ok(
  not has_function_privilege('authenticated', 'public.admin_list_user_identities(uuid)', 'EXECUTE'),
  'authenticated users cannot invoke the administrative identity inventory'
); -- 24

select ok(
  has_function_privilege('service_role', 'public.admin_list_user_identities(uuid)', 'EXECUTE'),
  'service role retains access to the administrative identity inventory'
); -- 25

select ok(
  not has_function_privilege('anon', 'public.claim_username(text)', 'EXECUTE'),
  'anonymous callers cannot invoke username claims'
); -- 26

select ok(
  not has_column_privilege('service_role', 'public.profiles', 'username', 'UPDATE')
  and not has_column_privilege('service_role', 'public.profiles', 'username_claimed_at', 'UPDATE')
  and not has_column_privilege('service_role', 'public.profiles', 'username_provenance', 'UPDATE'),
  'service role cannot bypass audited canonical username write paths'
); -- 27

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'username_claimed_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'username_provenance', 'UPDATE'),
  'authenticated users cannot directly rewrite canonical username state'
); -- 28

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"74000000-0000-4000-8000-000000000004","role":"authenticated","session_id":"74000000-0000-4000-8000-000000000104"}',
  true
);

select results_eq(
  $$ select provider_key, kind, email_verified, linked_at, provider_last_sign_in_at, status
     from public.list_my_login_methods() $$,
  $$ values (
       'apple'::text, 'apple'::text, true,
       '2026-01-04 00:01:00+00'::timestamptz,
       '2026-01-04 00:10:00+00'::timestamptz,
       'active'::text
     ) $$,
  'the upgraded caller RPC returns the exact persisted Apple login-method values'
); -- 29

select ok(
  (select bool_and(registry_id is not null and last_observed_at is not null)
   from public.list_my_login_methods()),
  'the upgraded caller RPC returns canonical registry and observation fields'
); -- 30

select is(
  (select count(*) from public.list_my_login_methods()),
  1::bigint,
  'the caller inventory is restricted to the signed-in user'
); -- 31

select ok(
  (select jsonb_agg(to_jsonb(method))::text from public.list_my_login_methods() as method)
    not like '%subject%'
  and (select jsonb_agg(to_jsonb(method))::text from public.list_my_login_methods() as method)
    not like '%token%',
  'the caller identity contract exposes neither provider subjects nor tokens'
); -- 32

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select results_eq(
  $$ select provider_key, kind, email_verified, linked_at, provider_last_sign_in_at, status
     from public.admin_list_user_identities('74000000-0000-4000-8000-000000000004') $$,
  $$ values (
       'apple'::text, 'apple'::text, true,
       '2026-01-04 00:01:00+00'::timestamptz,
       '2026-01-04 00:10:00+00'::timestamptz,
       'active'::text
     ) $$,
  'the upgraded admin RPC returns the exact same safe persisted identity values'
); -- 33

select ok(
  (select jsonb_agg(to_jsonb(method))::text
   from public.admin_list_user_identities('74000000-0000-4000-8000-000000000004') as method)
    not like '%subject%'
  and (select jsonb_agg(to_jsonb(method))::text
       from public.admin_list_user_identities('74000000-0000-4000-8000-000000000004') as method)
    not like '%token%',
  'the admin identity contract exposes neither provider subjects nor tokens'
); -- 34

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"71000000-0000-4000-8000-000000000101"}',
  true
);

select is(
  public.claim_username(' Upgraded_Legacy '),
  'upgraded_legacy'::text,
  'a legacy inferred user can claim one normalized canonical username after upgrade'
); -- 35

select is(
  (select username_provenance::text from public.profiles where id = '71000000-0000-4000-8000-000000000001'),
  'manual_claim'::text,
  'a legacy claim transitions to manual claim provenance'
); -- 36

select ok(
  (select username_claimed_at is not null from public.profiles where id = '71000000-0000-4000-8000-000000000001'),
  'a successful legacy claim records a server-owned claim marker'
); -- 37

select is(
  public.claim_username('UPGRADED_LEGACY'),
  'upgraded_legacy'::text,
  'repeating the same normalized legacy claim is idempotent'
); -- 38

select throws_ok(
  $$ select public.claim_username('renamed_after_claim') $$,
  'P0001', 'username_already_claimed',
  'a claimed legacy user cannot rename through the claim RPC'
); -- 39

select set_config(
  'request.jwt.claims',
  '{"sub":"78000000-0000-4000-8000-000000000008","role":"authenticated","session_id":"78000000-0000-4000-8000-000000000108"}',
  true
);

select throws_ok(
  $$ select public.claim_username(' MANUAL_SEED ') $$,
  'P0001', 'username_taken',
  'case-normalized collisions remain rejected after upgrade'
); -- 40

select is(
  public.claim_username('fresh_social'),
  'fresh_social'::text,
  'a social provisional user can recover from a collision by choosing a distinct username'
); -- 41

select is(
  (select username_provenance::text from public.profiles where id = '78000000-0000-4000-8000-000000000008'),
  'manual_claim'::text,
  'a successful social claim transitions to manual claim provenance'
); -- 42

select set_config(
  'request.jwt.claims',
  '{"sub":"74000000-0000-4000-8000-000000000004","role":"authenticated","session_id":"74000000-0000-4000-8000-000000000104"}',
  true
);

select throws_ok(
  $$ select public.claim_username('invalid-name') $$,
  '22023', 'username_invalid',
  'invalid username characters remain rejected after upgrade'
); -- 43

select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"72000000-0000-4000-8000-000000000102"}',
  true
);

select is(
  public.claim_username('REGISTRATION_SEED'),
  'registration_seed'::text,
  'an existing registration claim remains idempotent after upgrade'
); -- 44

select throws_ok(
  $$ select public.claim_username('registration_rename') $$,
  'P0001', 'username_already_claimed',
  'registration provenance prevents a later RPC rename'
); -- 45

reset role;

select throws_ok(
  $$ update public.profiles set username = 'direct_rename'
     where id = '72000000-0000-4000-8000-000000000002' $$,
  'P0001', 'username_provenance_transition_invalid',
  'the transition trigger blocks direct renaming of a trusted registration username'
); -- 46

select throws_ok(
  $$ update public.profiles
     set username_provenance = 'legacy_inferred', username_claimed_at = null
     where id = '72000000-0000-4000-8000-000000000002' $$,
  'P0001', 'username_provenance_transition_invalid',
  'the transition trigger blocks rollback from a trusted registration state'
); -- 47

select throws_ok(
  $$ update public.profiles
     set username_provenance = 'admin_verified', username_claimed_at = clock_timestamp()
     where id = '74000000-0000-4000-8000-000000000004' $$,
  'P0001', 'username_provenance_transition_invalid',
  'the transition trigger blocks unaudited promotion of a social provisional username'
); -- 48

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select public.admin_verify_username(
       '72000000-0000-4000-8000-000000000002', 'admin',
       '75000000-0000-4000-8000-000000000005', 'upgrade review', 'upgrade-verify-1'
     ) $$,
  '42501', 'service_role_required',
  'ordinary callers cannot invoke admin username verification'
); -- 49

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.admin_verify_username(
    '72000000-0000-4000-8000-000000000002', 'admin',
    '75000000-0000-4000-8000-000000000005', 'upgrade review', 'upgrade-verify-1'
  ),
  'legacy_null'::text,
  'service role can verify an unchanged legacy inferred username'
); -- 50

select results_eq(
  $$ select username, username_provenance::text, username_claimed_at is not null
     from public.profiles where id = '75000000-0000-4000-8000-000000000005' $$,
  $$ values ('legacy_null'::text, 'admin_verified'::text, true) $$,
  'admin verification preserves the username and establishes trusted provenance'
); -- 51

select is(
  (select count(*) from public.audit_logs
   where action = 'username.admin_verified'
     and target_user_id = '75000000-0000-4000-8000-000000000005'
     and metadata ->> 'requestId' = 'upgrade-verify-1'),
  1::bigint,
  'admin verification appends one correlated audit event'
); -- 52

select is(
  public.admin_verify_username(
    '72000000-0000-4000-8000-000000000002', 'admin',
    '75000000-0000-4000-8000-000000000005', 'repeat review', 'upgrade-verify-2'
  ),
  'legacy_null'::text,
  'repeated admin verification is idempotent'
); -- 53

select is(
  (select count(*) from public.audit_logs
   where action = 'username.admin_verified'
     and target_user_id = '75000000-0000-4000-8000-000000000005'),
  1::bigint,
  'idempotent admin verification does not duplicate audit events'
); -- 54

select throws_ok(
  $$ select public.admin_verify_username(
       '72000000-0000-4000-8000-000000000002', 'admin',
       '74000000-0000-4000-8000-000000000004', 'not legacy', 'upgrade-verify-social'
     ) $$,
  'P0001', 'username_not_admin_verifiable',
  'admin verification cannot promote a social provisional username'
); -- 55

reset role;

select results_eq(
  $$ select distinct username_provenance::text from public.profiles
     where id in (
       '71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002',
       '73000000-0000-4000-8000-000000000003', '74000000-0000-4000-8000-000000000004',
       '75000000-0000-4000-8000-000000000005', '76000000-0000-4000-8000-000000000006',
       '77000000-0000-4000-8000-000000000007', '78000000-0000-4000-8000-000000000008'
     ) order by 1 $$,
  $$ values
       ('admin_verified'::text), ('legacy_inferred'::text), ('manual_claim'::text),
       ('registration'::text), ('social_provisional'::text) $$,
  'the upgraded fixture exercises every supported provenance state end to end'
); -- 56

select ok(has_table_privilege('service_role', 'public.audit_logs', 'SELECT'), 'the corrective upgrade grants service-role audit reads');
select ok(has_table_privilege('service_role', 'public.audit_logs', 'INSERT'), 'the corrective upgrade grants service-role audit appends');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'UPDATE'), 'the corrective upgrade denies service-role audit updates');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'DELETE'), 'the corrective upgrade denies service-role audit deletes');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'TRUNCATE') and not has_table_privilege('service_role', 'public.audit_logs', 'REFERENCES') and not has_table_privilege('service_role', 'public.audit_logs', 'TRIGGER') and not has_table_privilege('service_role', 'public.audit_logs', 'MAINTAIN'), 'the corrective upgrade leaves no service-role audit table privilege beyond select and insert');
select ok(
  not (has_table_privilege('anon', 'public.audit_logs', 'SELECT')
    or has_table_privilege('anon', 'public.audit_logs', 'INSERT')
    or has_table_privilege('anon', 'public.audit_logs', 'UPDATE')
    or has_table_privilege('anon', 'public.audit_logs', 'DELETE')
    or has_table_privilege('anon', 'public.audit_logs', 'TRUNCATE')
    or has_table_privilege('anon', 'public.audit_logs', 'REFERENCES')
    or has_table_privilege('anon', 'public.audit_logs', 'TRIGGER')
    or has_table_privilege('anon', 'public.audit_logs', 'MAINTAIN')),
  'the corrective upgrade leaves anon with no audit table privileges'
);
select ok(
  not (has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
    or has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
    or has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
    or has_table_privilege('authenticated', 'public.audit_logs', 'DELETE')
    or has_table_privilege('authenticated', 'public.audit_logs', 'TRUNCATE')
    or has_table_privilege('authenticated', 'public.audit_logs', 'REFERENCES')
    or has_table_privilege('authenticated', 'public.audit_logs', 'TRIGGER')
    or has_table_privilege('authenticated', 'public.audit_logs', 'MAINTAIN')),
  'the corrective upgrade leaves authenticated with no audit table privileges'
);
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_logs'), 0::bigint, 'the corrective upgrade adds no audit-log RLS policy');
select ok(has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'USAGE'), 'the corrective upgrade preserves service-role audit sequence usage');
select ok(not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'SELECT') and not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'UPDATE'), 'the corrective upgrade removes broader service-role audit sequence access');
select ok(
  not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'USAGE')
  and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'SELECT')
  and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'UPDATE')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'USAGE')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'SELECT')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'UPDATE'),
  'the corrective upgrade removes client audit sequence access'
);

select * from finish();
rollback;
