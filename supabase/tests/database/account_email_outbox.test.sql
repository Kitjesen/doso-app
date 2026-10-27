begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','account_email_features','feature flag exists');
select has_table('public','account_email_outbox','outbox exists');
select ok(to_regclass('public.account_deletion_requests') is null,'deletion runtime table is absent');
select results_eq($$select kind,enabled from public.account_email_features$$,
  $$select 'new_device_login'::text,false$$,'only runtime kind defaults off');
select ok((select relrowsecurity from pg_class where oid='public.account_email_outbox'::regclass),'outbox has RLS');
select ok(not has_table_privilege('anon','public.account_email_outbox','SELECT')
  and not has_table_privilege('authenticated','public.account_email_outbox','SELECT')
  and not has_table_privilege('service_role','public.account_email_outbox','SELECT'),
  'outbox is RPC-only');
select has_index('public','account_email_outbox','account_email_outbox_kind_dedupe_digest_key',
  'kind and digest have the uniqueness index used as concurrency proof');
select index_is_unique('public','account_email_outbox','account_email_outbox_kind_dedupe_digest_key',
  'database unique enforcement is the local concurrency proof');

select has_function('public','claim_account_email',array['uuid'],'claim RPC exists');
select has_function('public','begin_account_email_dispatch',array['uuid','uuid','uuid'],'dispatch fence exists');
select has_function('public','accept_account_email',array['uuid','uuid','text','text'],'accept RPC exists');
select has_function('public','mark_account_email_unknown',array['uuid','uuid','text','text','text','text'],'unknown RPC exists');
select has_function('public','retry_rejected_account_email',array['uuid','uuid','text','text'],'definitive retry RPC exists');
select has_function('public','manual_retry_account_email_unknown',array['uuid','text'],'manual unknown retry exists');
select has_function('public','redact_account_email_outbox',array['timestamptz','integer'],'PII cleanup exists');
select is(pg_get_function_result('public.claim_account_email(uuid)'::regprocedure),
  'TABLE(id uuid, kind text, recipient_email text, payload jsonb, lease_token uuid, attempt_id uuid, attempt_count smallint)'::text,
  'claim contract includes attempt fencing');
select ok(has_function_privilege('service_role','public.claim_account_email(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.claim_account_email(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.claim_account_email(uuid)','EXECUTE'),
  'claim is service-only by grants');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('71111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','outbox@doso.test',crypt('StrongPass123',gen_salt('bf')),now(),
 '{"provider":"email","providers":["email"]}','{"username":"outbox_user"}',now(),now()),
('72222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated',null,null,now(),
 '{"provider":"apple","providers":["apple"]}','{"username":"no_email_user"}',now(),now()),
('73333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','rate-limit@doso.test',crypt('StrongPass123',gen_salt('bf')),now(),
 '{"provider":"email","providers":["email"]}','{"username":"rate_limit_user"}',now(),now());

insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','71111111-1111-4111-8111-111111111111',now(),now()),
  ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','71111111-1111-4111-8111-111111111111',now(),now()),
  ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','71111111-1111-4111-8111-111111111111',now(),now()),
  ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','71111111-1111-4111-8111-111111111111',now(),now()),
  ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','71111111-1111-4111-8111-111111111111',now(),now()),
  ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6','71111111-1111-4111-8111-111111111111',now(),now()),
  ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7','71111111-1111-4111-8111-111111111111',now(),now()),
  ('7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8','71111111-1111-4111-8111-111111111111',now(),now()),
  ('7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','72222222-2222-4222-8222-222222222222',now(),now()),
  ('7ccccccc-cccc-4ccc-8ccc-ccccccccccc1','73333333-3333-4333-8333-333333333333',now(),now()),
  ('7ccccccc-cccc-4ccc-8ccc-ccccccccccc2','73333333-3333-4333-8333-333333333333',now(),now()),
  ('7ccccccc-cccc-4ccc-8ccc-ccccccccccc3','73333333-3333-4333-8333-333333333333',now(),now()),
  ('7ccccccc-cccc-4ccc-8ccc-ccccccccccc4','73333333-3333-4333-8333-333333333333',now(),now());

create temporary table missing_auth_session_counts as
select
  (select count(*) from public.account_terminals) terminals,
  (select count(*) from public.account_email_outbox) outbox,
  (select count(*) from public.audit_logs) audits;
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaf"}',true);
select throws_ok(
  $$select public.register_account_terminal('missing-auth-session','android','Missing session','1.2.3','DOSO')$$,
  '42501','auth_session_inactive','an unbacked Auth session cannot register a terminal');
reset role;
select is((select count(*) from public.account_terminals),
  (select terminals from missing_auth_session_counts),'rejected Auth session writes no terminal');
select is((select count(*) from public.account_email_outbox),
  (select outbox from missing_auth_session_counts),'rejected Auth session writes no outbox row');
select is((select count(*) from public.audit_logs),
  (select audits from missing_auth_session_counts),'rejected Auth session writes no audit row');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}',true);
select lives_ok($$select public.register_account_terminal('same-install','android','Pixel','1.2.3','DOSO')$$,
 'registration succeeds while notification disabled');
reset role;
select is((select count(*) from public.account_email_outbox),0::bigint,'disabled flag creates no outbox row');
select is((select metadata->>'accountSecurityEmail' from public.audit_logs
  where action='terminal.register' order by id desc limit 1),'disabled'::text,'disabled outcome is audited');
select ok((select metadata ? 'installationDigest' and length(metadata->>'installationDigest')=64
  and not(metadata ? 'installationId') from public.audit_logs
  where action='terminal.register' order by id desc limit 1),'terminal audit stores only installation digest');

update public.account_email_features set enabled=true where kind='new_device_login';
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}',true);
select lives_ok($$select public.register_account_terminal('same-install','web','Chrome','1.2.3','Chrome')$$,'first enabled registration succeeds');
select lives_ok($$select public.register_account_terminal('rotated-client-id','web','Chrome','1.2.3','Chrome')$$,
 'same auth session cannot rotate its stable installation identity');
reset role;
select is((select installation_id from public.account_terminals
  where auth_session_id='7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  'same-install'::text,'server retains the first installation id for a session');
select is((select metadata->>'installationIdRetained' from public.audit_logs
  where actor_user_id='71111111-1111-4111-8111-111111111111' order by id desc limit 1),
  'true'::text,'installation id mutation is audited without storing the proposed id');
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"}',true);
select lives_ok($$select public.register_account_terminal('same-install','web','Chrome 2','1.2.3','Chrome')$$,'same installation sequential retry succeeds');
reset role;
select is((select count(*) from public.account_email_outbox),1::bigint,'same installation deduplicates');
select is((select length(dedupe_digest) from public.account_email_outbox),64,'dedupe is fixed SHA-256');
select ok(not(select payload?'account_email' from public.account_email_outbox)
  and not(select payload?|array['ip_address','location'] from public.account_email_outbox),
  'payload does not duplicate email or spoofed network location');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"}',true);
select lives_ok($$select public.register_account_terminal('email-less','ios','iPhone','1.2.3','DOSO')$$,
 'email-less user still registers');
reset role;
select is((select metadata->>'accountSecurityEmail' from public.audit_logs
  where actor_user_id='72222222-2222-4222-8222-222222222222' order by id desc limit 1),
  'not_applicable'::text,'email-less outcome is audited');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4"}',true);
select throws_ok($$select public.register_account_terminal('rollback-install','invalid-platform','Bad','1.2.3','DOSO')$$,
 '23514','new row for relation "account_terminals" violates check constraint "account_terminals_platform_check"',
 'terminal constraint failure aborts atomic registration');
reset role;
select is((select count(*) from public.account_terminals where installation_id='rollback-install'),0::bigint,'rollback leaves no terminal');
select is((select count(*) from public.audit_logs where metadata->>'installationDigest'=encode(extensions.digest(
  convert_to('71111111-1111-4111-8111-111111111111:rollback-install','UTF8'),'sha256'),'hex')),0::bigint,'rollback leaves no audit');

create function pg_temp.fail_account_email_outbox_insert() returns trigger
language plpgsql as $$begin raise exception 'injected_outbox_failure'; end$$;
create trigger inject_account_email_outbox_failure before insert on public.account_email_outbox
for each row execute function pg_temp.fail_account_email_outbox_insert();
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5"}',true);
select throws_ok($$select public.register_account_terminal('fault-outbox','web','Fault','1.2.3','DOSO')$$,
 'P0001','injected_outbox_failure','outbox failure aborts registration transaction');
reset role;
drop trigger inject_account_email_outbox_failure on public.account_email_outbox;
select is((select count(*) from public.account_terminals where installation_id='fault-outbox'),0::bigint,'outbox failure rolls back terminal');
select is((select count(*) from public.account_email_outbox where dedupe_digest=encode(extensions.digest(
  convert_to('71111111-1111-4111-8111-111111111111:fault-outbox','UTF8'),'sha256'),'hex')),0::bigint,'outbox failure leaves no outbox');
select is((select count(*) from public.audit_logs where metadata->>'installationDigest'=encode(extensions.digest(
  convert_to('71111111-1111-4111-8111-111111111111:fault-outbox','UTF8'),'sha256'),'hex')),0::bigint,'outbox failure leaves no audit');

create function pg_temp.fail_terminal_register_audit() returns trigger
language plpgsql as $$begin if new.action='terminal.register' then raise exception 'injected_audit_failure'; end if; return new; end$$;
create trigger inject_terminal_register_audit_failure before insert on public.audit_logs
for each row execute function pg_temp.fail_terminal_register_audit();
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6"}',true);
select throws_ok($$select public.register_account_terminal('fault-audit','web','Fault','1.2.3','DOSO')$$,
 'P0001','injected_audit_failure','audit failure aborts registration transaction');
reset role;
drop trigger inject_terminal_register_audit_failure on public.audit_logs;
select is((select count(*) from public.account_terminals where installation_id='fault-audit'),0::bigint,'audit failure rolls back terminal');
select is((select count(*) from public.account_email_outbox where dedupe_digest=encode(extensions.digest(
  convert_to('71111111-1111-4111-8111-111111111111:fault-audit','UTF8'),'sha256'),'hex')),0::bigint,'audit failure rolls back outbox');
select is((select count(*) from public.audit_logs where metadata->>'installationDigest'=encode(extensions.digest(
  convert_to('71111111-1111-4111-8111-111111111111:fault-audit','UTF8'),'sha256'),'hex')),0::bigint,'audit failure leaves no audit');

update public.account_email_features set enabled=false where kind='new_device_login';
select is((select count(*) from public.claim_account_email('70000000-0000-4000-8000-000000000000')),0::bigint,
 'queued message is not claimed while feature is off');
update public.account_email_features set enabled=true where kind='new_device_login';

select is((select count(*) from public.claim_account_email('70000000-0000-4000-8000-000000000001')),1::bigint,'claim returns one row');
select ok((select leased_until>now()+interval '60 seconds' from public.account_email_outbox),'server lease is at least 60 seconds');
create temporary table first_attempt as select lease_token,attempt_id from public.account_email_outbox;
update public.account_email_outbox set leased_until=now()-interval '1 second';
select is((select count(*) from public.claim_account_email('70000000-0000-4000-8000-000000000002')),1::bigint,
 'claim-before-dispatch crash is retryable');
select isnt((select attempt_id from first_attempt),(select attempt_id from public.account_email_outbox),'reclaim rotates attempt id');
update public.account_email_features set enabled=false where kind='new_device_login';
select is(public.begin_account_email_dispatch((select id from public.account_email_outbox),
  (select lease_token from public.account_email_outbox),(select attempt_id from public.account_email_outbox)),false,
 'leased attempt cannot cross disabled feature gate');
select is((select status from public.account_email_outbox),'leased'::text,'disabled dispatch remains safely leased');
update public.account_email_features set enabled=true where kind='new_device_login';
select is(public.begin_account_email_dispatch((select id from public.account_email_outbox),
  (select lease_token from first_attempt),(select attempt_id from first_attempt)),false,'stale attempt is fenced');
update public.account_email_outbox set attempt_count=max_attempts;
select is(public.begin_account_email_dispatch((select id from public.account_email_outbox),
  (select lease_token from public.account_email_outbox),(select attempt_id from public.account_email_outbox)),true,
 'current attempt begins dispatch');
update public.account_email_outbox set leased_until=now()-interval '1 second';
select is((select count(*) from public.claim_account_email('70000000-0000-4000-8000-000000000003')),0::bigint,
 'expired dispatch is never automatically reclaimed');
select is((select status from public.account_email_outbox),'delivery_unknown'::text,'expired dispatch becomes unknown');

select is(public.manual_retry_account_email_unknown((select id from public.account_email_outbox),
  'operator confirmed provider did not accept; duplicate risk approved'),true,'final attempt gets one explicit manual allowance');
select is((select metadata->>'possibleDuplicate' from public.audit_logs
  where action='account_email.unknown_retry' order by id desc limit 1),'true'::text,
  'manual retry audits duplicate risk');

create temporary table final_manual_attempt as
select * from public.claim_account_email('70000000-0000-4000-8000-000000000004');
select is((select attempt_count from final_manual_attempt),6::smallint,'manual allowance permits exactly one attempt beyond max');
select is(public.begin_account_email_dispatch((select id from final_manual_attempt),
  (select lease_token from final_manual_attempt),(select attempt_id from final_manual_attempt)),true,'manual final attempt begins');
select is(public.mark_account_email_unknown((select id from final_manual_attempt),(select attempt_id from final_manual_attempt),
  'timeout','manual retry outcome unknown',null,null),true,'manual final attempt can become unknown');
select is(public.manual_retry_account_email_unknown((select id from final_manual_attempt),
  'second retry must not be allowed'),false,'manual allowance cannot be granted twice');

update public.account_email_outbox set updated_at=now()-interval '31 days';
select is(public.redact_account_email_outbox(now()-interval '30 days',100),1,'unknown PII is redacted after 30 days');
select results_eq($$select user_id,recipient_email,payload,last_error_code,last_error_summary,
  redacted_at is not null,length(dedupe_digest),status from public.account_email_outbox$$,
  $$select null::uuid,'[redacted]'::text,'{}'::jsonb,null::text,null::text,true,64,'delivery_unknown'::text$$,
  'unknown cleanup clears user, recipient, payload, and error while retaining digest and state');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7"}',true);
select lives_ok($$select public.register_account_terminal('same-install','web','Chrome 3','1.2.3','Chrome')$$,
 'registration remains available after old outbox PII redaction');
reset role;
select is((select count(*) from public.account_email_outbox),1::bigint,'retained digest still prevents duplicate after redaction');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8"}',true);
select lives_ok($$select public.register_account_terminal('dead-install','web','Dead','1.2.3','DOSO')$$,'new installation creates dead-letter fixture');
reset role;
create temporary table dead_attempt as select * from public.claim_account_email('70000000-0000-4000-8000-000000000005');
select is(public.dead_letter_account_email((select id from dead_attempt),(select lease_token from dead_attempt),
  (select attempt_id from dead_attempt),'invalid_payload','invalid payload'),true,'live lease dead-letters');
select is(public.dead_letter_account_email((select id from dead_attempt),gen_random_uuid(),gen_random_uuid(),
  'stale','stale'),false,'stale dead-letter cannot mutate');

-- Client-provided installation IDs are not a trusted anti-abuse boundary.
-- Three distinct notifications per user/day are allowed; registration remains
-- available after the email cap is reached.
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"73333333-3333-4333-8333-333333333333","role":"authenticated","session_id":"7ccccccc-cccc-4ccc-8ccc-ccccccccccc1"}',true);
select lives_ok($$select public.register_account_terminal('rate-install-1','web','Browser 1','1.2.3','DOSO')$$,'rate fixture one registers');
select set_config('request.jwt.claims',
 '{"sub":"73333333-3333-4333-8333-333333333333","role":"authenticated","session_id":"7ccccccc-cccc-4ccc-8ccc-ccccccccccc2"}',true);
select lives_ok($$select public.register_account_terminal('rate-install-2','web','Browser 2','1.2.3','DOSO')$$,'rate fixture two registers');
select set_config('request.jwt.claims',
 '{"sub":"73333333-3333-4333-8333-333333333333","role":"authenticated","session_id":"7ccccccc-cccc-4ccc-8ccc-ccccccccccc3"}',true);
select lives_ok($$select public.register_account_terminal('rate-install-3','web','Browser 3','1.2.3','DOSO')$$,'rate fixture three registers');
select set_config('request.jwt.claims',
 '{"sub":"73333333-3333-4333-8333-333333333333","role":"authenticated","session_id":"7ccccccc-cccc-4ccc-8ccc-ccccccccccc4"}',true);
select lives_ok($$select public.register_account_terminal('rate-install-4','web','Browser 4','1.2.3','DOSO')$$,'rate-limited registration still succeeds');
reset role;
select is((select count(*) from public.account_email_outbox
  where user_id='73333333-3333-4333-8333-333333333333'),3::bigint,
  'per-user 24-hour cap prevents a fourth new-install email');
select is((select count(*) from public.account_terminals
  where user_id='73333333-3333-4333-8333-333333333333'),4::bigint,
  'email rate limit never blocks terminal registration');
select is((select metadata->>'accountSecurityEmail' from public.audit_logs
  where actor_user_id='73333333-3333-4333-8333-333333333333' order by id desc limit 1),
  'rate_limited'::text,'rate-limited outcome is audited');

-- A real two-connection dblink test was attempted, but the local Supabase test
-- role is non-superuser while local pg_hba uses trust authentication; dblink
-- rejects that combination even with credentials. The executable local proof
-- is therefore the unique index above plus sequential ON CONFLICT dedupe. A
-- hosted staging concurrency probe remains required before enabling the flag.

set local role anon;
select throws_ok($$select * from public.claim_account_email('70000000-0000-4000-8000-000000000005')$$,
 '42501','permission denied for function claim_account_email','anon cannot claim');
select * from finish();
rollback;
