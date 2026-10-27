begin isolation level repeatable read read only;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

-- This opt-in postflight is deliberately read-only and emits only invariant names.
-- It never returns user identifiers, usernames, email addresses, provider
-- subjects, subject digests, identity payloads, or tokens.
do $preconditions$
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'postflight_requires_read_only_transaction';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is null
     or to_regclass('public.profiles') is null
     or to_regclass('auth.users') is null
     or to_regclass('auth.identities') is null
     or to_regclass('private.account_identities') is null
     or to_regclass('public.audit_logs') is null
     or to_regclass('public.audit_logs_id_seq') is null then
    raise exception 'postflight_required_relation_missing';
  end if;

  if to_regtype('public.username_provenance') is null
     or to_regprocedure('private.enforce_username_provenance_transition()') is null
     or to_regprocedure('public.handle_new_user()') is null
     or to_regprocedure('public.claim_username(text)') is null
     or to_regprocedure('public.admin_verify_username(uuid,text,uuid,text,text)') is null
     or to_regprocedure('public.list_my_login_methods()') is null
     or to_regprocedure('public.admin_list_user_identities(uuid)') is null then
    raise exception 'postflight_required_type_or_function_missing';
  end if;
end
$preconditions$;

-- Emit TAP directly so this remains runnable against a linked hosted database
-- without attempting to install pgTAP in the read-only transaction.
select '1..35';

select case when current_setting('transaction_read_only') = 'on'
  then 'ok 1 - postflight transaction is read only'
  else 'not ok 1 - postflight transaction is read only'
end;

with expected(ordinal, version, name, digest) as (
  values
    (1, '20260822185808', 'create_doso_accounts_and_devices', 'b5edb16ee251624850f959dbe96f307b'),
    (2, '20260822185822', 'grant_service_role_access', 'a0d5728aef6ff30c178d0e33dd098541'),
    (3, '20260822185835', 'add_account_terminal_security', '556fc0d748a1571f8c775507d83c1059'),
    (4, '20260822185849', 'harden_network_backend', '328d8c93ba189a553767e7be1740452f'),
    (5, '20260822185907', 'add_admin_account_consistency', 'b74e8af42f5b19092c74b62ee0f2ef28'),
    (6, '20260822190119', 'enable_private_claims_rls', 'c7a7b819f478a3c0b50baad81abb3411'),
    (7, '20260823110629', 'add_unique_usernames', '8f574decc66e6f9996913fb26b1bf381'),
    (8, '20260823111035', 'inline_username_constraint', 'a7022548c34aede959def4620f60166f'),
    (9, '20260823130000', 'add_one_time_username_claim', '9dc20503cf47971617cc30ffa4d5cc4a'),
    (10, '20260824090000', 'add_external_identity_registry', '84bb557311647d71066a5d1bf689ae9e'),
    (11, '20260824100000', 'add_username_provenance', 'eeba323cd9188cd8e60c1666e3621be8'),
    (12, '20260824101000', 'canonicalize_login_method_contract', 'b8c362141a329cfd51ef9d1916b28a27'),
    (13, '20260824102000', 'harden_audit_log_privileges', '708e3582c625e062eacf8288028c9272')
), actual(ordinal, version, name, digest) as (
  select
    row_number() over (order by version)::integer,
    version::text,
    name::text,
    md5(rtrim(
      regexp_replace(array_to_string(statements, ';'), '\s+', '', 'g'),
      ';'
    ) || ';')
  from supabase_migrations.schema_migrations
), mismatches as (
  (select * from expected except select * from actual)
  union all
  (select * from actual except select * from expected)
)
select case when (select count(*) from actual) = 13
                  and not exists (select 1 from mismatches)
  then 'ok 2 - migration history exactly matches all 13 repository migrations'
  else 'not ok 2 - migration history exactly matches all 13 repository migrations'
end;

select case when (
    select array_agg(enumlabel::text order by enumsortorder)
    from pg_enum
    where enumtypid = 'public.username_provenance'::regtype
  ) = array[
    'registration', 'manual_claim', 'admin_verified',
    'legacy_inferred', 'social_provisional'
  ]::text[]
  then 'ok 3 - username provenance has the exact stable vocabulary'
  else 'not ok 3 - username provenance has the exact stable vocabulary'
end;

select case when exists (
    select 1
    from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'username_provenance'
      and atttypid = 'public.username_provenance'::regtype
      and attnotnull
      and not attisdropped
  )
  then 'ok 4 - username provenance is a required enum column'
  else 'not ok 4 - username provenance is a required enum column'
end;

select case when exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_username_provenance_claim_check'
      and contype = 'c'
      and convalidated
      and pg_get_constraintdef(oid) like '%username_claimed_at IS NOT NULL%'
      and pg_get_constraintdef(oid) like '%username_claimed_at IS NULL%'
      and pg_get_constraintdef(oid) like '%registration%'
      and pg_get_constraintdef(oid) like '%manual_claim%'
      and pg_get_constraintdef(oid) like '%admin_verified%'
      and pg_get_constraintdef(oid) like '%legacy_inferred%'
      and pg_get_constraintdef(oid) like '%social_provisional%'
  )
  then 'ok 5 - the validated provenance constraint covers every claimed state'
  else 'not ok 5 - the validated provenance constraint covers every claimed state'
end;

select case when exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_enforce_username_provenance_transition'
      and tgfoid = 'private.enforce_username_provenance_transition()'::regprocedure
      and tgtype = 19
      and tgenabled = 'O'
      and not tgisinternal
      and pg_get_triggerdef(oid) like '%username%'
      and pg_get_triggerdef(oid) like '%username_claimed_at%'
      and pg_get_triggerdef(oid) like '%username_provenance%'
  )
  then 'ok 6 - the provenance transition trigger is enabled for row updates'
  else 'not ok 6 - the provenance transition trigger is enabled for row updates'
end;

select case when exists (
    select 1 from pg_proc
    where oid = 'private.enforce_username_provenance_transition()'::regprocedure
      and prorettype = 'trigger'::regtype
      and not prosecdef
      and proconfig @> array['search_path=""']::text[]
  )
  then 'ok 7 - the transition function is a search-path-pinned invoker trigger'
  else 'not ok 7 - the transition function is a search-path-pinned invoker trigger'
end;

select case when exists (
    select 1 from pg_proc
    where oid = 'public.handle_new_user()'::regprocedure
      and prorettype = 'trigger'::regtype
      and prosecdef
      and proconfig @> array['search_path=""']::text[]
  )
  then 'ok 8 - the Auth profile handler is a pinned security definer trigger'
  else 'not ok 8 - the Auth profile handler is a pinned security definer trigger'
end;

select case when exists (
    select 1 from pg_proc
    where oid = 'public.claim_username(text)'::regprocedure
      and prorettype = 'text'::regtype
      and prosecdef
      and proconfig @> array['search_path=""']::text[]
  )
  then 'ok 9 - username claims use the pinned security definer function'
  else 'not ok 9 - username claims use the pinned security definer function'
end;

select case when exists (
    select 1 from pg_proc
    where oid = 'public.admin_verify_username(uuid,text,uuid,text,text)'::regprocedure
      and prorettype = 'text'::regtype
      and prosecdef
      and proconfig @> array['search_path=""']::text[]
  )
  then 'ok 10 - admin verification uses the pinned security definer function'
  else 'not ok 10 - admin verification uses the pinned security definer function'
end;

with function_grants as (
  select p.oid,
         coalesce(
           array_agg(coalesce(pg_get_userbyid(grantee), 'PUBLIC')::text order by coalesce(pg_get_userbyid(grantee), 'PUBLIC')::text)
             filter (where privilege_type = 'EXECUTE' and grantee <> p.proowner),
           array[]::text[]
         ) as execute_grantees
  from pg_proc as p
  left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) on true
  where p.oid in (
    'private.enforce_username_provenance_transition()'::regprocedure,
    'public.handle_new_user()'::regprocedure,
    'public.claim_username(text)'::regprocedure,
    'public.admin_verify_username(uuid,text,uuid,text,text)'::regprocedure
  )
  group by p.oid
)
select case when
    (select execute_grantees from function_grants where oid = 'private.enforce_username_provenance_transition()'::regprocedure) = array[]::text[]
    and (select execute_grantees from function_grants where oid = 'public.handle_new_user()'::regprocedure) = array[]::text[]
    and (select execute_grantees from function_grants where oid = 'public.claim_username(text)'::regprocedure) = array['authenticated']::text[]
    and (select execute_grantees from function_grants where oid = 'public.admin_verify_username(uuid,text,uuid,text,text)'::regprocedure) = array['service_role']::text[]
  then 'ok 11 - username functions have the exact non-owner execute grants'
  else 'not ok 11 - username functions have the exact non-owner execute grants'
end;

select case when
    not has_column_privilege('service_role', 'public.profiles', 'username', 'UPDATE')
    and not has_column_privilege('service_role', 'public.profiles', 'username_claimed_at', 'UPDATE')
    and not has_column_privilege('service_role', 'public.profiles', 'username_provenance', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'username_claimed_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'username_provenance', 'UPDATE')
  then 'ok 12 - canonical username state is writable only through its RPC paths'
  else 'not ok 12 - canonical username state is writable only through its RPC paths'
end;

select case when not exists (
    select 1 from public.profiles
    where (username_provenance in ('registration', 'manual_claim', 'admin_verified')
           and username_claimed_at is null)
       or (username_provenance in ('legacy_inferred', 'social_provisional')
           and username_claimed_at is not null)
  )
  then 'ok 13 - profile provenance and claim markers have no contradictions'
  else 'not ok 13 - profile provenance and claim markers have no contradictions'
end;

select case when (
    select count(*) from public.profiles
    where username_provenance is not null
  ) = (select count(*) from public.profiles)
  then 'ok 14 - every profile has exactly one provenance state'
  else 'not ok 14 - every profile has exactly one provenance state'
end;

select case when not exists (
    select 1 from public.profiles
    where username_claimed_at < created_at
  )
  then 'ok 15 - claim timestamps never predate profile creation'
  else 'not ok 15 - claim timestamps never predate profile creation'
end;

select case when not exists (
    select 1 from public.profiles
    where username_claimed_at = created_at
      and username_provenance in ('registration', 'manual_claim', 'admin_verified')
  )
  then 'ok 16 - legacy timestamp fingerprints are not trusted claims'
  else 'not ok 16 - legacy timestamp fingerprints are not trusted claims'
end;

select case when not exists (
    select 1
    from public.profiles as profiles
    left join auth.users as users on users.id = profiles.id
    where users.id is null
  )
  then 'ok 17 - every profile has a matching Auth user'
  else 'not ok 17 - every profile has a matching Auth user'
end;

select case when not exists (
    select 1
    from auth.users as users
    left join public.profiles as profiles on profiles.id = users.id
    where profiles.id is null
  )
  then 'ok 18 - every Auth user has a matching profile'
  else 'not ok 18 - every Auth user has a matching profile'
end;

select case when not exists (
    select username from public.profiles
    group by username having count(*) > 1
  )
  then 'ok 19 - canonical usernames remain globally unique'
  else 'not ok 19 - canonical usernames remain globally unique'
end;

select case when not exists (
    select 1
    from auth.identities as identities
    where not exists (
      select 1
      from private.account_identities as registry
      where registry.user_id = identities.user_id
        and registry.provider_key = identities.provider
        and registry.provider_subject_hash =
          private.external_identity_subject_hash(identities.provider, identities.provider_id)
        and registry.auth_identity_id = identities.id
        and registry.unlinked_at is null
    )
  )
  then 'ok 20 - every Auth identity has one exact active redacted projection'
  else 'not ok 20 - every Auth identity has one exact active redacted projection'
end;

select case when not exists (
    select 1
    from private.account_identities as registry
    where registry.unlinked_at is null
      and not exists (
        select 1
        from auth.identities as identities
        where identities.id = registry.auth_identity_id
          and identities.user_id = registry.user_id
          and identities.provider = registry.provider_key
          and private.external_identity_subject_hash(identities.provider, identities.provider_id)
            = registry.provider_subject_hash
      )
  )
  then 'ok 21 - every active projection has one exact Auth identity source'
  else 'not ok 21 - every active projection has one exact Auth identity source'
end;

select case when
    (select count(*) from auth.identities)
      = (select count(*) from private.account_identities where unlinked_at is null)
  then 'ok 22 - Auth and active projection cardinalities match'
  else 'not ok 22 - Auth and active projection cardinalities match'
end;

select case when not exists (
    select auth_identity_id
    from private.account_identities
    where unlinked_at is null
    group by auth_identity_id
    having count(*) > 1
  )
  then 'ok 23 - no Auth identity maps to conflicting active projections'
  else 'not ok 23 - no Auth identity maps to conflicting active projections'
end;

select case when not exists (
    select 1 from private.account_identities
    where provider_key is null
       or btrim(provider_key) = ''
       or octet_length(provider_subject_hash) <> 32
       or auth_identity_id is null
       or user_id is null
       or linked_at is null
       or last_observed_at is null
  )
  then 'ok 24 - identity projections retain complete redacted registry fields'
  else 'not ok 24 - identity projections retain complete redacted registry fields'
end;

select case when (
    select pg_get_function_result('public.list_my_login_methods()'::regprocedure)
  ) = 'TABLE(registry_id uuid, provider_key text, kind text, email_verified boolean, linked_at timestamp with time zone, provider_last_sign_in_at timestamp with time zone, last_observed_at timestamp with time zone, unlinked_at timestamp with time zone, status text)'
  then 'ok 25 - caller login-method RPC has the exact nine-column contract'
  else 'not ok 25 - caller login-method RPC has the exact nine-column contract'
end;

select case when (
    select pg_get_function_result('public.admin_list_user_identities(uuid)'::regprocedure)
  ) = 'TABLE(registry_id uuid, provider_key text, kind text, email_verified boolean, linked_at timestamp with time zone, provider_last_sign_in_at timestamp with time zone, last_observed_at timestamp with time zone, unlinked_at timestamp with time zone, status text)'
  then 'ok 26 - admin identity RPC has the exact nine-column contract'
  else 'not ok 26 - admin identity RPC has the exact nine-column contract'
end;

select case when not exists (
    select 1
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like any (array[
        'list_my_login_methods_%',
        'admin_list_user_identities_%'
      ])
      and parameter_mode = 'OUT'
      and parameter_name in ('id', 'last_sign_in_at', 'provider_id', 'provider_subject_hash', 'identity_data', 'provider_token')
  )
  then 'ok 27 - identity RPCs expose no legacy or sensitive output names'
  else 'not ok 27 - identity RPCs expose no legacy or sensitive output names'
end;

select case when (
    select bool_and(
      prosecdef
      and provolatile = 's'
      and proconfig @> array['search_path=""']::text[]
    )
    from pg_proc
    where oid in (
      'public.list_my_login_methods()'::regprocedure,
      'public.admin_list_user_identities(uuid)'::regprocedure
    )
  )
  then 'ok 28 - identity inventory RPCs are stable pinned security definers'
  else 'not ok 28 - identity inventory RPCs are stable pinned security definers'
end;

with function_grants as (
  select p.oid,
         coalesce(
           array_agg(coalesce(pg_get_userbyid(grantee), 'PUBLIC')::text order by coalesce(pg_get_userbyid(grantee), 'PUBLIC')::text)
             filter (where privilege_type = 'EXECUTE' and grantee <> p.proowner),
           array[]::text[]
         ) as execute_grantees
  from pg_proc as p
  left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) on true
  where p.oid in (
    'public.list_my_login_methods()'::regprocedure,
    'public.admin_list_user_identities(uuid)'::regprocedure
  )
  group by p.oid
)
select case when
    (select execute_grantees from function_grants where oid = 'public.list_my_login_methods()'::regprocedure)
      = array['authenticated']::text[]
    and (select execute_grantees from function_grants where oid = 'public.admin_list_user_identities(uuid)'::regprocedure)
      = array['service_role']::text[]
  then 'ok 29 - identity RPCs have the exact non-owner execute grants'
  else 'not ok 29 - identity RPCs have the exact non-owner execute grants'
end;

select case when
    not has_table_privilege('anon', 'private.account_identities', 'SELECT')
    and not has_table_privilege('authenticated', 'private.account_identities', 'SELECT')
    and not has_table_privilege('service_role', 'private.account_identities', 'SELECT')
  then 'ok 30 - the redacted identity registry remains private to definer functions'
  else 'not ok 30 - the redacted identity registry remains private to definer functions'
end;

select case when exists (
    select 1 from pg_trigger
    where tgrelid = 'auth.identities'::regclass
      and tgname = 'sync_auth_identity_projection'
      and tgfoid = 'private.sync_auth_identity_projection()'::regprocedure
      and tgtype = 29
      and tgenabled = 'O'
      and not tgisinternal
  )
  then 'ok 31 - the Auth identity projection trigger covers insert update and delete'
  else 'not ok 31 - the Auth identity projection trigger covers insert update and delete'
end;

select case when
    not has_function_privilege('anon', 'private.external_identity_subject_hash(text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.external_identity_subject_hash(text,text)', 'EXECUTE')
    and not has_function_privilege('service_role', 'private.external_identity_subject_hash(text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.sync_auth_identity_projection()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.sync_auth_identity_projection()', 'EXECUTE')
    and not has_function_privilege('service_role', 'private.sync_auth_identity_projection()', 'EXECUTE')
  then 'ok 32 - internal identity projection functions have no client execute grants'
  else 'not ok 32 - internal identity projection functions have no client execute grants'
end;

select case when
    has_table_privilege('service_role', 'public.audit_logs', 'SELECT')
    and has_table_privilege('service_role', 'public.audit_logs', 'INSERT')
    and not has_table_privilege('service_role', 'public.audit_logs', 'UPDATE')
    and not has_table_privilege('service_role', 'public.audit_logs', 'DELETE')
    and not has_table_privilege('service_role', 'public.audit_logs', 'TRUNCATE')
    and not has_table_privilege('service_role', 'public.audit_logs', 'REFERENCES')
    and not has_table_privilege('service_role', 'public.audit_logs', 'TRIGGER')
    and not has_table_privilege('service_role', 'public.audit_logs', 'MAINTAIN')
    and not (
      has_table_privilege('anon', 'public.audit_logs', 'SELECT')
      or has_table_privilege('anon', 'public.audit_logs', 'INSERT')
      or has_table_privilege('anon', 'public.audit_logs', 'UPDATE')
      or has_table_privilege('anon', 'public.audit_logs', 'DELETE')
      or has_table_privilege('anon', 'public.audit_logs', 'TRUNCATE')
      or has_table_privilege('anon', 'public.audit_logs', 'REFERENCES')
      or has_table_privilege('anon', 'public.audit_logs', 'TRIGGER')
      or has_table_privilege('anon', 'public.audit_logs', 'MAINTAIN')
      or has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
      or has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
      or has_table_privilege('authenticated', 'public.audit_logs', 'UPDATE')
      or has_table_privilege('authenticated', 'public.audit_logs', 'DELETE')
      or has_table_privilege('authenticated', 'public.audit_logs', 'TRUNCATE')
      or has_table_privilege('authenticated', 'public.audit_logs', 'REFERENCES')
      or has_table_privilege('authenticated', 'public.audit_logs', 'TRIGGER')
      or has_table_privilege('authenticated', 'public.audit_logs', 'MAINTAIN')
    )
  then 'ok 33 - audit table grants are exactly append-and-read for service role and absent for clients'
  else 'not ok 33 - audit table grants are exactly append-and-read for service role and absent for clients'
end;

select case when
    has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'USAGE')
    and not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'SELECT')
    and not has_sequence_privilege('service_role', 'public.audit_logs_id_seq', 'UPDATE')
    and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'USAGE')
    and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'SELECT')
    and not has_sequence_privilege('anon', 'public.audit_logs_id_seq', 'UPDATE')
    and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'USAGE')
    and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'SELECT')
    and not has_sequence_privilege('authenticated', 'public.audit_logs_id_seq', 'UPDATE')
  then 'ok 34 - audit identity sequence grants are usage-only for service role and absent for clients'
  else 'not ok 34 - audit identity sequence grants are usage-only for service role and absent for clients'
end;

select case when
    (select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass)
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_logs') = 0
  then 'ok 35 - audit logs retain RLS with zero policies'
  else 'not ok 35 - audit logs retain RLS with zero policies'
end;

rollback;
