begin isolation level repeatable read read only;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

-- Hosted baseline report for the exact repository history ending at
-- 20260823111035. It deliberately fails closed on a newer, older, or drifted
-- schema. The report emits only aggregate counts, fixed category numbers and
-- bounded anonymous ordinals; no account-level value is returned.
do $preconditions$
declare
  v_handler_definition text;
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'hosted_pre_username_report_requires_read_only_transaction';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.audit_logs') is null
     or to_regclass('auth.users') is null
     or to_regclass('auth.identities') is null then
    raise exception 'hosted_pre_username_required_relation_missing';
  end if;

  if not exists (
       select 1 from information_schema.columns
       where table_schema = 'supabase_migrations'
         and table_name = 'schema_migrations'
         and column_name = 'name'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'supabase_migrations'
         and table_name = 'schema_migrations'
         and column_name = 'statements'
         and data_type = 'ARRAY'
     ) then
    raise exception 'hosted_pre_username_migration_evidence_columns_missing';
  end if;

  if exists (
       with expected(ordinal, version, name, digest) as (
         values
           (1, '20260822185808', 'create_doso_accounts_and_devices', 'b5edb16ee251624850f959dbe96f307b'),
           (2, '20260822185822', 'grant_service_role_access', 'a0d5728aef6ff30c178d0e33dd098541'),
           (3, '20260822185835', 'add_account_terminal_security', '556fc0d748a1571f8c775507d83c1059'),
           (4, '20260822185849', 'harden_network_backend', '328d8c93ba189a553767e7be1740452f'),
           (5, '20260822185907', 'add_admin_account_consistency', 'b74e8af42f5b19092c74b62ee0f2ef28'),
           (6, '20260822190119', 'enable_private_claims_rls', 'c7a7b819f478a3c0b50baad81abb3411'),
           (7, '20260823110629', 'add_unique_usernames', '8f574decc66e6f9996913fb26b1bf381'),
           (8, '20260823111035', 'inline_username_constraint', 'a7022548c34aede959def4620f60166f')
       ), actual(ordinal, version, name, digest) as (
         select
           row_number() over (order by version)::integer,
           version::text,
           name::text,
           md5(rtrim(regexp_replace(array_to_string(statements, ';'), '\s+', '', 'g'), ';') || ';')
         from supabase_migrations.schema_migrations
       )
       (select * from expected except select * from actual)
       union all
       (select * from actual except select * from expected)
     )
     or (select count(*) from supabase_migrations.schema_migrations) <> 8 then
    raise exception 'hosted_pre_username_migration_history_mismatch';
  end if;

  if not exists (
       select 1
       from pg_attribute
       where attrelid = 'public.profiles'::regclass
         and attname = 'username'
         and atttypid = 'text'::regtype
         and attnotnull
         and not attisdropped
     )
     or exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name in ('username_claimed_at', 'username_provenance')
     )
     or to_regtype('public.username_provenance') is not null
     or to_regclass('private.account_identities') is not null then
    raise exception 'hosted_pre_username_profile_shape_mismatch';
  end if;

  if not exists (
       select 1 from pg_constraint
       where conrelid = 'public.profiles'::regclass
         and conname = 'profiles_username_format_check'
         and contype = 'c' and convalidated
         and pg_get_constraintdef(oid) like '%^[a-z0-9_]{3,24}$%'
     )
     or not exists (
       select 1 from pg_constraint
       where conrelid = 'public.profiles'::regclass
         and conname = 'profiles_username_reserved_check'
         and contype = 'c' and convalidated
     )
     or not exists (
       select 1 from pg_index
       where indexrelid = to_regclass('public.profiles_username_key')
         and indrelid = 'public.profiles'::regclass
         and indisunique and indisvalid
     ) then
    raise exception 'hosted_pre_username_constraint_shape_mismatch';
  end if;

  if to_regprocedure('private.normalize_username(text)') is null
     or to_regprocedure('public.handle_new_user()') is null
     or to_regprocedure('public.admin_suspend_user_account(uuid,text,uuid,text,text)') is null
     or to_regprocedure('public.admin_activate_user_account(uuid,text,uuid,text,text)') is null
     or to_regprocedure('public.admin_revoke_user_terminal(uuid,text,uuid,uuid,text,text)') is null
     or to_regprocedure('public.claim_username(text)') is not null
     or to_regprocedure('public.list_my_login_methods()') is not null
     or to_regprocedure('public.admin_list_user_identities(uuid)') is not null
     or to_regprocedure('public.admin_verify_username(uuid,text,uuid,text,text)') is not null then
    raise exception 'hosted_pre_username_rpc_shape_mismatch';
  end if;

  if not exists (
       select 1 from pg_proc
       where oid = 'private.normalize_username(text)'::regprocedure
         and prorettype = 'text'::regtype
         and provolatile = 'i'
         and proisstrict
         and not prosecdef
         and proconfig @> array['search_path=""']::text[]
     )
     or not exists (
       select 1 from pg_proc
       where oid = 'public.handle_new_user()'::regprocedure
         and prorettype = 'trigger'::regtype
         and prosecdef
         and proconfig @> array['search_path=""']::text[]
     ) then
    raise exception 'hosted_pre_username_function_attributes_mismatch';
  end if;

  select pg_get_functiondef('public.handle_new_user()'::regprocedure)
  into v_handler_definition;

  if v_handler_definition not like '%raw_user_meta_data ->> ''username''%'
     or v_handler_definition not like '%pg_catalog.hashtext(''doso.username.allocate'')%'
     or v_handler_definition not like '%pg_catalog.left(v_base, 24)%'
     or v_handler_definition not like '%v_counter := 2%' then
    raise exception 'hosted_pre_username_allocator_shape_mismatch';
  end if;
end
$preconditions$;

-- Raw TAP keeps the report runnable without installing pgTAP or writing any
-- helper object to the inspected database.
select '1..17';

select case when current_setting('transaction_read_only') = 'on'
              and current_setting('transaction_isolation') = 'repeatable read'
  then 'ok 1 - report transaction is repeatable-read and read only'
  else 'not ok 1 - report transaction is repeatable-read and read only'
end;

select case when not exists (
    select 1
    from auth.users as users
    left join public.profiles as profiles on profiles.id = users.id
    where profiles.id is null
  )
  then 'ok 2 - every Auth user has a profile'
  else 'not ok 2 - every Auth user has a profile'
end;

select case when not exists (
    select 1
    from public.profiles as profiles
    left join auth.users as users on users.id = profiles.id
    where users.id is null
  )
  then 'ok 3 - every profile has an Auth user'
  else 'not ok 3 - every profile has an Auth user'
end;

select case when not exists (
    select 1 from public.profiles where username is null
  )
  then 'ok 4 - usernames are non-null'
  else 'not ok 4 - usernames are non-null'
end;

select case when not exists (
    select 1 from public.profiles
    where username !~ '^[a-z0-9_]{3,24}$'
       or username <> private.normalize_username(username)
  )
  then 'ok 5 - usernames have canonical format'
  else 'not ok 5 - usernames have canonical format'
end;

select case when not exists (
    select 1 from public.profiles
    where username = any (array[
      'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
      'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
      'register', 'robot', 'robotics', 'root', 'security', 'signup',
      'staff', 'support', 'system', 'undefined'
    ]::text[])
  )
  then 'ok 6 - usernames exclude the historical reserved set'
  else 'not ok 6 - usernames exclude the historical reserved set'
end;

select case when not exists (
    select username from public.profiles group by username having count(*) > 1
  )
  then 'ok 7 - usernames are globally unique'
  else 'not ok 7 - usernames are globally unique'
end;

select case when not exists (
    select 1 from public.profiles
    where created_at is null or updated_at is null or updated_at < created_at
  )
  then 'ok 8 - profile timestamps are sane'
  else 'not ok 8 - profile timestamps are sane'
end;

-- GoTrue may record the initial sign-in immediately before inserting the
-- identity row, so last_sign_in_at < created_at is not itself corruption.
-- Timestamp sanity therefore checks ordering of stored row timestamps and
-- rejects only materially future lifecycle times.
select case when not exists (
    select 1 from auth.users
    where created_at is null or updated_at is null or updated_at < created_at
       or created_at > statement_timestamp() + interval '5 minutes'
       or updated_at > statement_timestamp() + interval '5 minutes'
       or last_sign_in_at > statement_timestamp() + interval '5 minutes'
  )
  then 'ok 9 - Auth user timestamps are sane'
  else 'not ok 9 - Auth user timestamps are sane'
end;

select case when not exists (
    select 1 from auth.identities
    where created_at is null or updated_at is null or updated_at < created_at
       or created_at > statement_timestamp() + interval '5 minutes'
       or updated_at > statement_timestamp() + interval '5 minutes'
       or last_sign_in_at > statement_timestamp() + interval '5 minutes'
  )
  then 'ok 10 - Auth identity timestamps are sane'
  else 'not ok 10 - Auth identity timestamps are sane'
end;

select case when not exists (
    select 1
    from auth.identities as identities
    left join auth.users as users on users.id = identities.user_id
    where users.id is null
  )
  then 'ok 11 - Auth identities have an owning Auth user'
  else 'not ok 11 - Auth identities have an owning Auth user'
end;

select case when not exists (
    select 1 from auth.identities
    where provider is null or btrim(provider) = ''
       or provider_id is null or btrim(provider_id) = ''
  )
  then 'ok 12 - Auth identity provider keys are present'
  else 'not ok 12 - Auth identity provider keys are present'
end;

select case when not exists (
    select 1 from auth.identities
    where provider not in (
      'email', 'apple', 'wechat', 'custom:wechat', 'qq', 'custom:qq'
    )
  )
  then 'ok 13 - Auth identity providers are in the release allowlist'
  else 'not ok 13 - Auth identity providers are in the release allowlist'
end;

select case when not exists (
    select provider, provider_id
    from auth.identities
    group by provider, provider_id
    having count(distinct user_id) > 1
  )
  then 'ok 14 - provider subjects have one account owner'
  else 'not ok 14 - provider subjects have one account owner'
end;

select case when not exists (
    select user_id, provider
    from auth.identities
    group by user_id, provider
    having count(*) > 1
  )
  then 'ok 15 - accounts have at most one identity per provider'
  else 'not ok 15 - accounts have at most one identity per provider'
end;

select case when not exists (
    select id from auth.identities group by id having count(*) > 1
  )
  then 'ok 16 - Auth identity rows have unique registry identifiers'
  else 'not ok 16 - Auth identity rows have unique registry identifiers'
end;

-- This is a pre-release baseline assertion, not the final ACL contract. The
-- verified production head currently exposes dangerous service-role mutation
-- privileges; 20260824102000 must remove them before postflight can pass.
select case when
    has_table_privilege('service_role', 'public.audit_logs', 'SELECT')
    and has_table_privilege('service_role', 'public.audit_logs', 'INSERT')
    and has_table_privilege('service_role', 'public.audit_logs', 'UPDATE')
    and has_table_privilege('service_role', 'public.audit_logs', 'DELETE')
    and has_table_privilege('service_role', 'public.audit_logs', 'TRUNCATE')
    and not has_table_privilege('anon', 'public.audit_logs', 'SELECT')
    and not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'audit_logs') = 0
  then 'ok 17 - hosted baseline has known unsafe service-role audit ACL drift; migration 20260824102000 is mandatory'
  else 'not ok 17 - hosted audit ACL differs from the verified pre-release drift baseline; stop and investigate'
end;

select format(
  '# aggregate totals: auth_users=%s profiles=%s auth_identities=%s',
  (select count(*) from auth.users),
  (select count(*) from public.profiles),
  (select count(*) from auth.identities)
);

-- Attribute distributions and anomaly samples remain suppressed regardless of
-- cohort size. A minimum group size of five is the release-report privacy
-- floor, but this report intentionally emits no sensitive category even above
-- that threshold; the seventeen hard invariants retain the required diagnostics.
select '# legacy username source hint: suppressed (minimum_group_size=5)';
select '# identity provider distribution: suppressed (minimum_group_size=5)';
select '# anonymous anomaly samples: suppressed (minimum_group_size=5)';

rollback;
