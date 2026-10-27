-- Fixed read-only structural inventory. No user/session rows, object names,
-- function bodies, credentials, DDL or permission changes. Presence is NOT
-- semantic correctness, deployment approval or a Storage/Auth acceptance test.
with expected_columns(name) as (
  values ('display_name_managed_by_user'), ('avatar_managed_by_user'), ('avatar_lifecycle_epoch')
), expected_functions(label, signature) as (
  values
    ('updateProfile', 'public.update_my_profile(uuid,text,text,text,text)'),
    ('prepareAvatarCleanup', 'public.prepare_my_profile_avatar_cleanup(uuid,text)'),
    ('avatarAccessState', 'private.profile_avatar_access_state(text)'),
    ('authSessionAuthority', 'private.is_current_auth_session_present()'),
    ('activeSessionGate', 'private.is_session_active()')
), expected_policies(name) as (
  values ('profile_avatars_retired_insert_guard'), ('profile_avatars_retired_delete_guard'),
    ('profile_avatars_select_active_owner'), ('profile_avatars_insert_active_owner'),
    ('profile_avatars_delete_active_owner')
)
select pg_catalog.jsonb_build_object(
  'profileColumns', (select pg_catalog.jsonb_object_agg(e.name, exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = pg_catalog.to_regclass('public.profiles') and a.attname = e.name
      and a.attnum > 0 and not a.attisdropped
  )) from expected_columns e),
  'functions', (select pg_catalog.jsonb_object_agg(e.label, pg_catalog.jsonb_build_object(
    'present', p.oid is not null,
    'securityDefiner', p.prosecdef,
    'emptySearchPath', p.proconfig @> array['search_path=""']::text[],
    'authenticatedExecute', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'anonExecute', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  )) from expected_functions e
    left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(e.signature)),
  'avatarBucket', (select pg_catalog.jsonb_build_object(
    'present', true, 'public', b.public, 'fileSizeLimit', b.file_size_limit,
    'mimeTypesMatch', b.allowed_mime_types @> array['image/jpeg','image/png']::text[]
      and b.allowed_mime_types <@ array['image/jpeg','image/png']::text[]
  ) from storage.buckets b where b.id = 'profile-avatars'),
  'avatarPolicies', (select pg_catalog.jsonb_object_agg(e.name, exists (
    select 1 from pg_catalog.pg_policy p
    where p.polrelid = pg_catalog.to_regclass('storage.objects') and p.polname = e.name
  )) from expected_policies e),
  'retirementTable', pg_catalog.to_regclass('private.profile_avatar_retirements') is not null,
  'profilesRlsEnabled', (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = pg_catalog.to_regclass('public.profiles')),
  'storageObjectsRlsEnabled', (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = pg_catalog.to_regclass('storage.objects')),
  'authSessionsSelectForAuthenticated', pg_catalog.has_table_privilege(
    'authenticated', pg_catalog.to_regclass('auth.sessions'), 'SELECT'),
  'directAvatarUpdateForAuthenticated', pg_catalog.has_column_privilege(
    'authenticated', pg_catalog.to_regclass('public.profiles'), 'avatar_url', 'UPDATE')
) as structural_inventory;
