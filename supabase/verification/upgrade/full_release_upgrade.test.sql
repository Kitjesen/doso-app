begin;

do $sentinel$
begin
  if pg_catalog.to_regclass('private.doso_upgrade_harness_sentinel') is null then
    raise exception using errcode = 'P0001', message = 'upgrade_harness_sentinel_required';
  end if;
  if not exists (
    select 1 from private.doso_upgrade_harness_sentinel
    where scenario = 'hosted_head_20260823111035_to_g002'
  ) then
    raise exception using errcode = 'P0001', message = 'upgrade_harness_scenario_mismatch';
  end if;
end;
$sentinel$;

create extension if not exists pgtap with schema extensions;
select plan(60);

select results_eq(
  $$ select id from public.profiles
     where id in (
       '81000000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-000000000002',
       '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000004',
       '84000000-0000-4000-8000-000000000004', '84000000-0000-4001-8000-000000000005',
       '86000000-0000-4000-8000-000000000006', '87000000-0000-4000-8000-000000000007',
       '88000000-0000-4000-8000-000000000008'
     ) order by id $$,
  $$ values
       ('81000000-0000-4000-8000-000000000001'::uuid), ('81100000-0000-4000-8000-000000000002'::uuid),
       ('82000000-0000-4000-8000-000000000003'::uuid), ('83000000-0000-4000-8000-000000000004'::uuid),
       ('84000000-0000-4000-8000-000000000004'::uuid), ('84000000-0000-4001-8000-000000000005'::uuid),
       ('86000000-0000-4000-8000-000000000006'::uuid), ('87000000-0000-4000-8000-000000000007'::uuid),
       ('88000000-0000-4000-8000-000000000008'::uuid) $$,
  'the exact hosted-head release chain preserves the nine-user fixture set'
); -- 1

select is((select username from public.profiles where id = '81000000-0000-4000-8000-000000000001'), 'abcdefghijklmnopqrstuvwx'::text, 'the hosted-head trigger allocates a canonical raw-metadata username'); -- 2
select is((select username from public.profiles where id = '81100000-0000-4000-8000-000000000002'), 'abcdefghijklmnopqrstuv_2'::text, 'the hosted-head trigger preserves a distinct canonical raw-metadata username'); -- 3
select is((select username from public.profiles where id = '82000000-0000-4000-8000-000000000003'), 'display_source'::text, 'the hosted-head trigger allocates from display name when raw username is absent'); -- 4
select is((select username from public.profiles where id = '83000000-0000-4000-8000-000000000004'), 'email_prefix_tag'::text, 'the hosted-head trigger allocates from normalized email prefix when richer sources are absent'); -- 5
select is((select username from public.profiles where id = '84000000-0000-4000-8000-000000000004'), 'user_840000000000'::text, 'the hosted-head trigger uses UUID fallback when source fields are empty'); -- 6
select is((select username from public.profiles where id = '84000000-0000-4001-8000-000000000005'), 'user_840000000000_2'::text, 'the hosted-head trigger resolves a real UUID fallback collision with a deterministic suffix'); -- 7

select results_eq(
  $$ select username_provenance::text, username_claimed_at is null
     from public.profiles
     where id in (
       '81000000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-000000000002',
       '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000004',
       '84000000-0000-4000-8000-000000000004', '84000000-0000-4001-8000-000000000005'
     ) order by id $$,
  $$ values
       ('legacy_inferred'::text, true), ('legacy_inferred'::text, true),
       ('legacy_inferred'::text, true), ('legacy_inferred'::text, true),
       ('legacy_inferred'::text, true), ('legacy_inferred'::text, true) $$,
  'all hosted-head allocation sources are corrected from 130000 claimed fingerprints to legacy inferred state'
); -- 8

select results_eq(
  $$ select username, username_provenance::text, username_claimed_at is not null
     from public.profiles where id = '86000000-0000-4000-8000-000000000006' $$,
  $$ values ('stage_registration'::text, 'registration'::text, true) $$,
  'a real post-130000 email registration survives as registration provenance'
); -- 9

select results_eq(
  $$ select username, username_provenance::text, username_claimed_at is not null
     from public.profiles where id = '87000000-0000-4000-8000-000000000007' $$,
  $$ values ('stage_manual'::text, 'manual_claim'::text, true) $$,
  'a real pre-G002 claim RPC survives as manual claim provenance'
); -- 10

select results_eq(
  $$ select username, username_provenance::text, username_claimed_at is null
     from public.profiles where id = '88000000-0000-4000-8000-000000000008' $$,
  $$ values ('user_880000000000'::text, 'social_provisional'::text, true) $$,
  'a real post-130000 social signup remains provisional despite provider username metadata'
); -- 11

select is(
  (select count(distinct username) from public.profiles where id in (
    '81000000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000004',
    '84000000-0000-4000-8000-000000000004', '84000000-0000-4001-8000-000000000005',
    '86000000-0000-4000-8000-000000000006', '87000000-0000-4000-8000-000000000007',
    '88000000-0000-4000-8000-000000000008'
  )), 9::bigint,
  'the hosted-head release chain loses or aliases no canonical usernames'
); -- 12

select index_is_unique('public', 'profiles', 'profiles_username_key', 'global username uniqueness remains enforced'); -- 13
select is((select count(*) from public.profiles where username_provenance in ('registration','manual_claim','admin_verified') and username_claimed_at is null), 0::bigint, 'no trusted provenance lacks a claim marker'); -- 14
select is((select count(*) from public.profiles where username_provenance in ('legacy_inferred','social_provisional') and username_claimed_at is not null), 0::bigint, 'no provisional provenance retains a claim marker'); -- 15

select is(
  (select string_agg(parameter_name, ',' order by ordinal_position) from information_schema.parameters
   where specific_schema = 'public' and specific_name like 'list_my_login_methods_%' and parameter_mode = 'OUT'),
  'registry_id,provider_key,kind,email_verified,linked_at,provider_last_sign_in_at,last_observed_at,unlinked_at,status'::text,
  'the caller identity RPC has the exact canonical columns'
); -- 16
select is(
  (select string_agg(parameter_name, ',' order by ordinal_position) from information_schema.parameters
   where specific_schema = 'public' and specific_name like 'admin_list_user_identities_%' and parameter_mode = 'OUT'),
  'registry_id,provider_key,kind,email_verified,linked_at,provider_last_sign_in_at,last_observed_at,unlinked_at,status'::text,
  'the admin identity RPC has the exact canonical columns'
); -- 17
select is(
  (select string_agg(udt_name, ',' order by ordinal_position) from information_schema.parameters
   where specific_schema = 'public' and specific_name like 'list_my_login_methods_%' and parameter_mode = 'OUT'),
  'uuid,text,text,bool,timestamptz,timestamptz,timestamptz,timestamptz,text'::text,
  'the canonical identity RPC output types remain stable'
); -- 18
select ok(has_function_privilege('authenticated', 'public.list_my_login_methods()', 'EXECUTE'), 'authenticated users can list their own identities'); -- 19
select ok(not has_function_privilege('authenticated', 'public.admin_list_user_identities(uuid)', 'EXECUTE'), 'authenticated users cannot list another users identities'); -- 20
select ok(has_function_privilege('service_role', 'public.admin_list_user_identities(uuid)', 'EXECUTE'), 'service role can use the safe admin identity RPC'); -- 21
select ok(not has_function_privilege('anon', 'public.claim_username(text)', 'EXECUTE'), 'anonymous users cannot claim usernames'); -- 22
select ok(not has_column_privilege('service_role', 'public.profiles', 'username', 'UPDATE'), 'service role cannot directly rename usernames'); -- 23
select ok(not has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE'), 'authenticated users cannot directly rename usernames'); -- 24

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88000000-0000-4000-8000-000000000008","role":"authenticated","session_id":"88000000-0000-4000-8000-000000000108"}', true);
select results_eq(
  $$ select provider_key, kind, email_verified, linked_at, provider_last_sign_in_at, status from public.list_my_login_methods() $$,
  $$ values ('apple'::text, 'apple'::text, true, '2026-02-08 00:01:00+00'::timestamptz, '2026-02-08 00:10:00+00'::timestamptz, 'active'::text) $$,
  'the caller RPC returns exact Apple runtime values after the full upgrade chain'
); -- 25
select ok((select bool_and(registry_id is not null and last_observed_at is not null) from public.list_my_login_methods()), 'the caller RPC returns canonical registry and observation fields'); -- 26
select is((select count(*) from public.list_my_login_methods()), 1::bigint, 'the caller RPC returns only the signed-in users identity'); -- 27
select ok((select jsonb_agg(to_jsonb(method))::text from public.list_my_login_methods() method) not like '%subject%' and (select jsonb_agg(to_jsonb(method))::text from public.list_my_login_methods() method) not like '%token%', 'the caller RPC leaks no identity subject or token'); -- 28
select throws_ok($$ select public.claim_username('STAGE_MANUAL') $$, 'P0001', 'username_taken', 'a social provisional claim cannot collide with the existing manual claim'); -- 29

select set_config('request.jwt.claims', '{"sub":"86000000-0000-4000-8000-000000000006","role":"authenticated","session_id":"86000000-0000-4000-8000-000000000106"}', true);
select is(public.claim_username('STAGE_REGISTRATION'), 'stage_registration'::text, 'the registration username remains idempotent'); -- 30
select throws_ok($$ select public.claim_username('registration_rename') $$, 'P0001', 'username_already_claimed', 'registration provenance blocks a later rename'); -- 31
select set_config('request.jwt.claims', '{"sub":"87000000-0000-4000-8000-000000000007","role":"authenticated","session_id":"87000000-0000-4000-8000-000000000107"}', true);
select is(public.claim_username('STAGE_MANUAL'), 'stage_manual'::text, 'the manual claim remains idempotent'); -- 32
select throws_ok($$ select public.claim_username('manual_rename') $$, 'P0001', 'username_already_claimed', 'manual claim provenance blocks a later rename'); -- 33
reset role;

select throws_ok($$ update public.profiles set username = 'direct_rename' where id = '86000000-0000-4000-8000-000000000006' $$, 'P0001', 'username_provenance_transition_invalid', 'the transition trigger blocks direct trusted username renames'); -- 34
select throws_ok($$ update public.profiles set username_provenance = 'legacy_inferred', username_claimed_at = null where id = '86000000-0000-4000-8000-000000000006' $$, 'P0001', 'username_provenance_transition_invalid', 'the transition trigger blocks trusted provenance rollback'); -- 35
select throws_ok($$ update public.profiles set username_provenance = 'admin_verified', username_claimed_at = now() where id = '88000000-0000-4000-8000-000000000008' $$, 'P0001', 'username_provenance_transition_invalid', 'the transition trigger blocks unaudited social promotion'); -- 36

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select public.admin_verify_username('86000000-0000-4000-8000-000000000006','admin','82000000-0000-4000-8000-000000000003','release review','chain-verify-1') $$,
  '42501', 'service_role_required', 'ordinary callers cannot verify legacy usernames'
); -- 37
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.admin_verify_username('86000000-0000-4000-8000-000000000006','admin','82000000-0000-4000-8000-000000000003','release review','chain-verify-1'), 'display_source'::text, 'service role can verify an unchanged legacy backfill username'); -- 38
select results_eq($$ select username, username_provenance::text, username_claimed_at is not null from public.profiles where id = '82000000-0000-4000-8000-000000000003' $$, $$ values ('display_source'::text,'admin_verified'::text,true) $$, 'admin verification preserves the backfilled username and establishes trust'); -- 39
select is((select count(*) from public.audit_logs where action = 'username.admin_verified' and target_user_id = '82000000-0000-4000-8000-000000000003' and metadata->>'requestId' = 'chain-verify-1'), 1::bigint, 'admin verification records one correlated audit event'); -- 40
select is(public.admin_verify_username('86000000-0000-4000-8000-000000000006','admin','82000000-0000-4000-8000-000000000003','repeat review','chain-verify-2'), 'display_source'::text, 'admin verification is idempotent'); -- 41
select is((select count(*) from public.audit_logs where action = 'username.admin_verified' and target_user_id = '82000000-0000-4000-8000-000000000003'), 1::bigint, 'idempotent verification does not duplicate audit events'); -- 42
select throws_ok($$ select public.admin_verify_username('86000000-0000-4000-8000-000000000006','admin','88000000-0000-4000-8000-000000000008','not legacy','chain-verify-social') $$, 'P0001', 'username_not_admin_verifiable', 'admin verification rejects social provisional usernames'); -- 43
select results_eq(
  $$ select provider_key, kind, email_verified, status from public.admin_list_user_identities('86000000-0000-4000-8000-000000000006') $$,
  $$ values ('email'::text, 'email'::text, true, 'active'::text) $$,
  'the admin RPC derives confirmed email verification from current Auth truth'
); -- 44
select ok((select jsonb_agg(to_jsonb(method))::text from public.admin_list_user_identities('86000000-0000-4000-8000-000000000006') method) not like '%subject%' and (select jsonb_agg(to_jsonb(method))::text from public.admin_list_user_identities('86000000-0000-4000-8000-000000000006') method) not like '%token%', 'the admin RPC leaks no identity subject or token'); -- 45
reset role;

select is((select count(*) from public.profiles where username_provenance in ('registration','manual_claim','admin_verified') and username_claimed_at is null), 0::bigint, 'post-transition trusted states remain internally consistent'); -- 46
select is((select count(*) from public.profiles where username_provenance in ('legacy_inferred','social_provisional') and username_claimed_at is not null), 0::bigint, 'post-transition provisional states remain internally consistent'); -- 47
select results_eq(
  $$ select distinct username_provenance::text from public.profiles where id in (
       '81000000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-000000000002',
       '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000004',
       '84000000-0000-4000-8000-000000000004', '84000000-0000-4001-8000-000000000005',
       '86000000-0000-4000-8000-000000000006', '87000000-0000-4000-8000-000000000007',
       '88000000-0000-4000-8000-000000000008') order by 1 $$,
  $$ values ('admin_verified'::text),('legacy_inferred'::text),('manual_claim'::text),('registration'::text),('social_provisional'::text) $$,
  'the full chain exercises all five durable provenance states'
); -- 48
select is(
  (select count(*) from public.profiles where id in (
    '81000000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000004',
    '84000000-0000-4000-8000-000000000004', '84000000-0000-4001-8000-000000000005',
    '86000000-0000-4000-8000-000000000006', '87000000-0000-4000-8000-000000000007',
    '88000000-0000-4000-8000-000000000008')),
  9::bigint, 'all seven username-origin paths finish with no profile loss'
); -- 49

select ok(has_table_privilege('service_role', 'public.audit_logs', 'SELECT'), 'the full upgrade grants service-role audit reads');
select ok(has_table_privilege('service_role', 'public.audit_logs', 'INSERT'), 'the full upgrade grants service-role audit appends');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'UPDATE'), 'the full upgrade denies service-role audit updates');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'DELETE'), 'the full upgrade denies service-role audit deletes');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'TRUNCATE') and not has_table_privilege('service_role', 'public.audit_logs', 'REFERENCES') and not has_table_privilege('service_role', 'public.audit_logs', 'TRIGGER') and not has_table_privilege('service_role', 'public.audit_logs', 'MAINTAIN'), 'the full upgrade leaves no service-role audit table privilege beyond select and insert');
select ok(
  not (has_table_privilege('anon', 'public.audit_logs', 'SELECT')
    or has_table_privilege('anon', 'public.audit_logs', 'INSERT')
    or has_table_privilege('anon', 'public.audit_logs', 'UPDATE')
    or has_table_privilege('anon', 'public.audit_logs', 'DELETE')
    or has_table_privilege('anon', 'public.audit_logs', 'TRUNCATE')
    or has_table_privilege('anon', 'public.audit_logs', 'REFERENCES')
    or has_table_privilege('anon', 'public.audit_logs', 'TRIGGER')
    or has_table_privilege('anon', 'public.audit_logs', 'MAINTAIN')),
  'the full upgrade leaves anon with no audit table privileges'
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
  'the full upgrade leaves authenticated with no audit table privileges'
);
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_logs'), 0::bigint, 'the full upgrade adds no audit-log RLS policy');
select ok(has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'USAGE'), 'the full upgrade preserves service-role audit sequence usage');
select ok(not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'SELECT') and not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'UPDATE'), 'the full upgrade removes broader service-role audit sequence access');
select ok(
  not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'USAGE')
  and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'SELECT')
  and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'UPDATE')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'USAGE')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'SELECT')
  and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'UPDATE'),
  'the full upgrade removes client audit sequence access'
);

select * from finish();
rollback;
