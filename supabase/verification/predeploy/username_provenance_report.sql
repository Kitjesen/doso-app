begin isolation level repeatable read read only;

set local statement_timeout = '30s';
set local lock_timeout = '5s';

-- This report is intentionally valid only for the exact pre-G002 schema. It
-- must fail closed instead of silently describing a database that has already
-- moved past (or has drifted away from) the expected deployment starting point.
do $preconditions$
declare
  v_user_rpc_result text;
  v_admin_rpc_result text;
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'predeploy_report_requires_read_only_transaction';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is null
     or to_regclass('public.profiles') is null
     or to_regclass('auth.users') is null
     or to_regclass('auth.identities') is null
     or to_regclass('private.account_identities') is null then
    raise exception 'predeploy_schema_precondition_failed';
  end if;

  if not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'username_claimed_at'
     )
     or exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'username_provenance'
     )
     or to_regtype('public.username_provenance') is not null
     or to_regprocedure('public.admin_verify_username(uuid,text,uuid,text,text)') is not null then
    raise exception 'predeploy_username_schema_is_not_exactly_pre_g002';
  end if;

  if exists (
       with expected(version) as (
         values
           ('20260822185808'),
           ('20260822185822'),
           ('20260822185835'),
           ('20260822185849'),
           ('20260822185907'),
           ('20260822190119'),
           ('20260823110629'),
           ('20260823111035'),
           ('20260823130000'),
           ('20260824090000')
       ), actual(version) as (
         select version::text from supabase_migrations.schema_migrations
       )
       (select version from expected except select version from actual)
       union all
       (select version from actual except select version from expected)
     )
     or (select count(*) from supabase_migrations.schema_migrations) <> 10 then
    raise exception 'predeploy_migration_history_is_not_exactly_pre_g002';
  end if;

  if to_regprocedure('public.claim_username(text)') is null
     or to_regprocedure('public.list_my_login_methods()') is null
     or to_regprocedure('public.admin_list_user_identities(uuid)') is null then
    raise exception 'predeploy_required_rpc_is_missing';
  end if;

  select regexp_replace(pg_get_function_result(oid), '\s+', ' ', 'g')
  into v_user_rpc_result
  from pg_proc
  where oid = 'public.list_my_login_methods()'::regprocedure;

  select regexp_replace(pg_get_function_result(oid), '\s+', ' ', 'g')
  into v_admin_rpc_result
  from pg_proc
  where oid = 'public.admin_list_user_identities(uuid)'::regprocedure;

  if v_user_rpc_result <> 'TABLE(id uuid, provider_key text, kind text, email_verified boolean, linked_at timestamp with time zone, last_sign_in_at timestamp with time zone, last_observed_at timestamp with time zone, unlinked_at timestamp with time zone, status text)'
     or v_admin_rpc_result <> 'TABLE(id uuid, provider_key text, kind text, email_verified boolean, linked_at timestamp with time zone, last_sign_in_at timestamp with time zone, last_observed_at timestamp with time zone, unlinked_at timestamp with time zone, status text)' then
    raise exception 'predeploy_login_method_rpc_contract_is_not_pre_g002';
  end if;
end
$preconditions$;

-- Emit TAP directly so the report remains runnable through `supabase test db`
-- without installing an extension (which would violate the read-only contract).
select '1..11';

select case when current_setting('transaction_read_only') = 'on'
  then 'ok 1 - report transaction is read only'
  else 'not ok 1 - report transaction is read only'
end;

select case when not exists (
    select 1
    from public.profiles
    where username is null
       or username <> private.normalize_username(username)
       or username !~ '^[a-z0-9_]{3,24}$'
       or username = any (array[
         'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
         'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
         'register', 'robot', 'robotics', 'root', 'security', 'signup',
         'staff', 'support', 'system', 'undefined'
       ]::text[])
  )
  then 'ok 2 - every pre-migration username has a valid canonical shape'
  else 'not ok 2 - every pre-migration username has a valid canonical shape'
end;

with classified as (
  select case
    when users.id is null then 'orphan_to_legacy_inferred'
    when profiles.username_claimed_at = profiles.created_at
      then 'legacy_fingerprint_to_inferred'
    when profiles.username_claimed_at is not null
     and coalesce(users.raw_app_meta_data ->> 'provider', '') = 'email'
     and nullif(btrim(users.raw_user_meta_data ->> 'username'), '') is not null
     and profiles.username = lower(btrim(users.raw_user_meta_data ->> 'username'))
      then 'verified_email_registration'
    when profiles.username_claimed_at is not null then 'claimed_to_manual_claim'
    when coalesce(users.raw_app_meta_data ->> 'provider', '') not in ('', 'email')
      then 'social_to_provisional'
    else 'unclaimed_to_legacy_inferred'
  end as category
  from public.profiles as profiles
  left join auth.users as users on users.id = profiles.id
), counts as (
  select category, count(*)::bigint as row_count
  from classified
  group by category
)
select format('# username classification: category=%s count=%s', category, row_count)
from counts
order by category;

-- Reconstruct the 110629 source priority, normalizer, reserved/invalid fallback,
-- 24-character truncation and observable collision outcome. These are
-- non-trusted evidence hints only; they never establish username provenance.
-- No username, source value, UUID, or stable row fingerprint is emitted.
with source_inputs as (
  select
    profiles.id,
    profiles.username,
    case
      when nullif(users.raw_user_meta_data ->> 'username', '') is not null
        then 'raw_metadata'
      when nullif(profiles.display_name, '') is not null then 'display_name'
      when nullif(split_part(profiles.email, '@', 1), '') is not null
        then 'email_prefix'
      else 'no_source_default'
    end as source_kind,
    private.normalize_username(coalesce(
      nullif(users.raw_user_meta_data ->> 'username', ''),
      nullif(profiles.display_name, ''),
      nullif(split_part(profiles.email, '@', 1), ''),
      'user'
    )) as normalized_base
  from public.profiles as profiles
  left join auth.users as users on users.id = profiles.id
  where profiles.username_claimed_at = profiles.created_at
     or profiles.username_claimed_at is null
), reconstructed as (
  select
    source_inputs.*,
    source_inputs.normalized_base !~ '^[a-z0-9_]{3,24}$'
      or source_inputs.normalized_base = any (array[
        'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
        'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
        'register', 'robot', 'robotics', 'root', 'security', 'signup',
        'staff', 'support', 'system', 'undefined'
      ]::text[]) as used_generated_fallback,
    left(
      case
        when source_inputs.normalized_base !~ '^[a-z0-9_]{3,24}$'
          or source_inputs.normalized_base = any (array[
            'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
            'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
            'register', 'robot', 'robotics', 'root', 'security', 'signup',
            'staff', 'support', 'system', 'undefined'
          ]::text[])
          then 'user_' || substring(replace(source_inputs.id::text, '-', ''), 1, 12)
        else source_inputs.normalized_base
      end,
      24
    ) as expected_unsuffixed_candidate
  from source_inputs
), inferred_hints as (
  select case
    when username <> expected_unsuffixed_candidate then 'ambiguous_or_collision'
    when used_generated_fallback then 'generated_user_placeholder'
    when source_kind = 'raw_metadata' then 'raw_metadata_source'
    when source_kind = 'display_name' then 'display_name_source'
    when source_kind = 'email_prefix' then 'email_prefix_source'
    else 'ambiguous_or_collision'
  end as hint
  from reconstructed
)
select format(
  '# non-trusted legacy source evidence hint: category=%s count=%s',
  hint,
  count(*)
)
from inferred_hints
group by hint
order by hint;

-- Contradictory evidence is reported independently from the migration's branch
-- order. These counts let an operator assess ambiguity before deploying while
-- keeping all account-level evidence inside the database.
with evidence_counts as (
  select
    count(*) filter (
      where profiles.username_claimed_at = profiles.created_at
        and coalesce(users.raw_app_meta_data ->> 'provider', '') = 'email'
        and nullif(btrim(users.raw_user_meta_data ->> 'username'), '') is not null
        and profiles.username = lower(btrim(users.raw_user_meta_data ->> 'username'))
    )::bigint as fingerprint_with_registration_evidence,
    count(*) filter (
      where profiles.username_claimed_at is not null
        and coalesce(users.raw_app_meta_data ->> 'provider', '') <> 'email'
    )::bigint as claimed_social_or_unknown_provider,
    count(*) filter (
      where profiles.username_claimed_at is not null
        and coalesce(users.raw_app_meta_data ->> 'provider', '') = 'email'
        and (
          nullif(btrim(users.raw_user_meta_data ->> 'username'), '') is null
          or profiles.username <> lower(btrim(users.raw_user_meta_data ->> 'username'))
        )
    )::bigint as claimed_email_missing_or_mismatched_username,
    count(*) filter (
      where profiles.username_claimed_at is null
        and coalesce(users.raw_app_meta_data ->> 'provider', '') = 'email'
        and nullif(btrim(users.raw_user_meta_data ->> 'username'), '') is not null
        and profiles.username = lower(btrim(users.raw_user_meta_data ->> 'username'))
    )::bigint as unclaimed_with_registration_evidence
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
), duplicate_active_registry as (
  select count(*)::bigint as group_count
  from (
    select registry.user_id, registry.provider_key
    from private.account_identities as registry
    where registry.unlinked_at is null
    group by registry.user_id, registry.provider_key
    having count(*) > 1
  ) as duplicate_groups
), users_without_profile as (
  select count(*)::bigint as row_count
  from auth.users as users
  where not exists (
    select 1 from public.profiles as profiles where profiles.id = users.id
  )
)
select format(
  '# contradictory evidence: users_without_profile=%s fingerprint_with_registration_evidence=%s claimed_social_or_unknown_provider=%s claimed_email_missing_or_mismatched_username=%s unclaimed_with_registration_evidence=%s duplicate_active_user_provider_groups=%s',
  users_without_profile.row_count,
  evidence_counts.fingerprint_with_registration_evidence,
  evidence_counts.claimed_social_or_unknown_provider,
  evidence_counts.claimed_email_missing_or_mismatched_username,
  evidence_counts.unclaimed_with_registration_evidence,
  duplicate_active_registry.group_count
)
from evidence_counts, duplicate_active_registry, users_without_profile;

select case when not exists (
    select 1
    from public.profiles as profiles
    left join auth.users as users on users.id = profiles.id
    where users.id is null
  ) then 'ok 3 - profiles have matching Auth users'
  else 'not ok 3 - profiles have matching Auth users'
end;

select case when not exists (
    select 1 from public.profiles
    where username_claimed_at < created_at
  ) then 'ok 4 - claimed timestamps do not predate profile creation'
  else 'not ok 4 - claimed timestamps do not predate profile creation'
end;

select case when not exists (
    select username from public.profiles
    group by username having count(*) > 1
  ) then 'ok 5 - canonical usernames remain unique before migration'
  else 'not ok 5 - canonical usernames remain unique before migration'
end;

select case when not exists (
    select 1
    from auth.identities as identities
    where not exists (
      select 1
      from private.account_identities as registry
      where registry.unlinked_at is null
        and registry.auth_identity_id = identities.id
        and registry.user_id = identities.user_id
        and registry.provider_key = identities.provider
        and registry.provider_subject_hash =
          private.external_identity_subject_hash(identities.provider, identities.provider_id)
    )
  ) then 'ok 6 - every Auth identity has a redacted registry projection'
  else 'not ok 6 - every Auth identity has a redacted registry projection'
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
  ) then 'ok 7 - every active registry projection still exists in Auth'
  else 'not ok 7 - every active registry projection still exists in Auth'
end;

select case when not exists (
    select 1
    from private.account_identities as registry
    where octet_length(registry.provider_subject_hash) <> 32
  ) then 'ok 8 - registry subjects remain fixed-length irreversible digests'
  else 'not ok 8 - registry subjects remain fixed-length irreversible digests'
end;

select case when not exists (
    select 1
    from private.account_identities as registry
    join auth.identities as identities
      on identities.id = registry.auth_identity_id
    where identities.user_id <> registry.user_id
       or identities.provider <> registry.provider_key
  ) then 'ok 9 - registry identity ownership and provider classification match Auth'
  else 'not ok 9 - registry identity ownership and provider classification match Auth'
end;

select case when not exists (
    select 1
    from auth.users as users
    where not exists (
      select 1 from public.profiles as profiles where profiles.id = users.id
    )
  ) then 'ok 10 - every Auth user has a profile before migration'
  else 'not ok 10 - every Auth user has a profile before migration'
end;

select case when not exists (
    select 1
    from auth.identities as left_identity
    join auth.identities as right_identity
      on right_identity.provider = left_identity.provider
     and right_identity.provider_id = left_identity.provider_id
     and right_identity.user_id <> left_identity.user_id
     and right_identity.id > left_identity.id
  ) and not exists (
    select 1
    from private.account_identities as registry
    join auth.identities as identities
      on identities.provider = registry.provider_key
     and private.external_identity_subject_hash(identities.provider, identities.provider_id)
       = registry.provider_subject_hash
    where identities.user_id <> registry.user_id
  ) then 'ok 11 - Auth and registry subjects have one consistent owner'
  else 'not ok 11 - Auth and registry subjects have one consistent owner'
end;

with identity_drift as (
  select
    count(*) filter (
      where registry.unlinked_at is not null
        and exists (
          select 1
          from auth.identities as identities
          where identities.user_id = registry.user_id
            and identities.provider = registry.provider_key
            and private.external_identity_subject_hash(identities.provider, identities.provider_id)
              = registry.provider_subject_hash
        )
    )::bigint as tombstoned_while_auth_exists,
    count(*) filter (
      where registry.unlinked_at is null
        and exists (
          select 1
          from auth.identities as identities
          where identities.user_id = registry.user_id
            and identities.provider = registry.provider_key
            and private.external_identity_subject_hash(identities.provider, identities.provider_id)
              = registry.provider_subject_hash
        )
        and not exists (
          select 1
          from auth.identities as identities
          where identities.id = registry.auth_identity_id
            and identities.user_id = registry.user_id
            and identities.provider = registry.provider_key
            and private.external_identity_subject_hash(identities.provider, identities.provider_id)
              = registry.provider_subject_hash
        )
    )::bigint as stale_auth_identity_id
  from private.account_identities as registry
)
select format(
  '# identity drift evidence: tombstoned_while_auth_exists=%s stale_auth_identity_id=%s',
  tombstoned_while_auth_exists,
  stale_auth_identity_id
)
from identity_drift;

with provider_counts as (
  select
    case provider
      when 'email' then 'email'
      when 'apple' then 'apple'
      when 'wechat' then 'wechat'
      when 'custom:wechat' then 'custom:wechat'
      when 'qq' then 'qq'
      when 'custom:qq' then 'custom:qq'
      else 'other'
    end as provider_class,
    count(*)::bigint as auth_count,
    0::bigint as registry_count,
    0::bigint as active_registry_count
  from auth.identities
  group by 1
  union all
  select
    case provider_key
      when 'email' then 'email'
      when 'apple' then 'apple'
      when 'wechat' then 'wechat'
      when 'custom:wechat' then 'custom:wechat'
      when 'qq' then 'qq'
      when 'custom:qq' then 'custom:qq'
      else 'other'
    end,
    0::bigint,
    count(*)::bigint,
    count(*) filter (where unlinked_at is null)::bigint
  from private.account_identities
  group by 1
), rolled_up as (
  select provider_class,
         sum(auth_count) as auth_count,
         sum(registry_count) as registry_count,
         sum(active_registry_count) as active_registry_count
  from provider_counts
  group by provider_class
)
select format(
  '# identity distribution: provider_class=%s auth=%s registry=%s active_registry=%s',
  provider_class, auth_count, registry_count, active_registry_count
)
from rolled_up
order by provider_class;

-- Bounded anonymous samples help operators see which anomaly classes exist
-- without revealing which account produced them.
with anomalies as (
  select 'orphan_profile'::text as category
  from public.profiles as profiles
  left join auth.users as users on users.id = profiles.id
  where users.id is null
  union all
  select 'claimed_before_profile_creation'
  from public.profiles
  where username_claimed_at < created_at
  union all
  select 'auth_identity_missing_projection'
  from auth.identities as identities
  where not exists (
    select 1 from private.account_identities as registry
    where registry.unlinked_at is null
      and registry.auth_identity_id = identities.id
      and registry.user_id = identities.user_id
      and registry.provider_key = identities.provider
      and registry.provider_subject_hash =
        private.external_identity_subject_hash(identities.provider, identities.provider_id)
  )
  union all
  select 'active_projection_missing_auth_identity'
  from private.account_identities as registry
  where registry.unlinked_at is null
    and not exists (
      select 1 from auth.identities as identities
      where identities.id = registry.auth_identity_id
        and identities.user_id = registry.user_id
        and identities.provider = registry.provider_key
        and private.external_identity_subject_hash(identities.provider, identities.provider_id)
          = registry.provider_subject_hash
    )
  union all
  select 'auth_user_missing_profile'
  from auth.users as users
  where not exists (
    select 1 from public.profiles as profiles where profiles.id = users.id
  )
  union all
  select 'fingerprint_with_registration_evidence'
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  where profiles.username_claimed_at = profiles.created_at
    and coalesce(users.raw_app_meta_data ->> 'provider', '') = 'email'
    and nullif(btrim(users.raw_user_meta_data ->> 'username'), '') is not null
    and profiles.username = lower(btrim(users.raw_user_meta_data ->> 'username'))
  union all
  select 'claimed_social_or_unknown_provider'
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  where profiles.username_claimed_at is not null
    and coalesce(users.raw_app_meta_data ->> 'provider', '') <> 'email'
  union all
  select 'claimed_email_metadata_missing_or_mismatched'
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  where profiles.username_claimed_at is not null
    and coalesce(users.raw_app_meta_data ->> 'provider', '') = 'email'
    and (
      nullif(btrim(users.raw_user_meta_data ->> 'username'), '') is null
      or profiles.username <> lower(btrim(users.raw_user_meta_data ->> 'username'))
    )
  union all
  select 'unclaimed_with_registration_evidence'
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  where profiles.username_claimed_at is null
    and coalesce(users.raw_app_meta_data ->> 'provider', '') = 'email'
    and nullif(btrim(users.raw_user_meta_data ->> 'username'), '') is not null
    and profiles.username = lower(btrim(users.raw_user_meta_data ->> 'username'))
  union all
  select 'duplicate_active_user_provider_group'
  from private.account_identities as registry
  where registry.unlinked_at is null
  group by registry.user_id, registry.provider_key
  having count(*) > 1
  union all
  select 'subject_owner_conflict'
  from private.account_identities as registry
  join auth.identities as identities
    on identities.provider = registry.provider_key
   and private.external_identity_subject_hash(identities.provider, identities.provider_id)
     = registry.provider_subject_hash
  where identities.user_id <> registry.user_id
  union all
  select 'auth_subject_owner_conflict'
  from auth.identities as left_identity
  join auth.identities as right_identity
    on right_identity.provider = left_identity.provider
   and right_identity.provider_id = left_identity.provider_id
   and right_identity.user_id <> left_identity.user_id
   and right_identity.id > left_identity.id
  union all
  select 'tombstoned_while_auth_exists'
  from private.account_identities as registry
  where registry.unlinked_at is not null
    and exists (
      select 1 from auth.identities as identities
      where identities.user_id = registry.user_id
        and identities.provider = registry.provider_key
        and private.external_identity_subject_hash(identities.provider, identities.provider_id)
          = registry.provider_subject_hash
    )
  union all
  select 'stale_auth_identity_id'
  from private.account_identities as registry
  where registry.unlinked_at is null
    and exists (
      select 1 from auth.identities as identities
      where identities.user_id = registry.user_id
        and identities.provider = registry.provider_key
        and private.external_identity_subject_hash(identities.provider, identities.provider_id)
          = registry.provider_subject_hash
    )
    and not exists (
      select 1 from auth.identities as identities
      where identities.id = registry.auth_identity_id
        and identities.user_id = registry.user_id
        and identities.provider = registry.provider_key
        and private.external_identity_subject_hash(identities.provider, identities.provider_id)
          = registry.provider_subject_hash
    )
), bounded as (
  select category,
         row_number() over (partition by category order by category) as anonymous_ordinal
  from anomalies
)
select format(
  '# anonymous anomaly sample: category=%s ordinal=%s', category, anonymous_ordinal
)
from bounded
where anonymous_ordinal <= 5
order by category, anonymous_ordinal;

rollback;
