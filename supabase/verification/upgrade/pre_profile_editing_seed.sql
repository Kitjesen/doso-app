-- Synthetic fixture for the isolated upgrade harness only, not hosted data.
-- This runs BEFORE the profile migration, so new provenance columns do not exist.
create table private.doso_upgrade_harness_sentinel (
  scenario text primary key
);
insert into private.doso_upgrade_harness_sentinel (scenario)
values ('pre_profile_editing');

-- Exercise the historical privilege transition, not merely the final fresh
-- schema. Never grant anything here to manufacture the expected starting ACL.
create table private.doso_profile_upgrade_privilege_snapshot as
select
  pg_catalog.has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE') as avatar_direct_update,
  pg_catalog.has_column_privilege('authenticated','public.profiles','display_name','UPDATE') as nickname_direct_update;
do $legacy_privileges$
begin
  if (select avatar_direct_update and nickname_direct_update
      from private.doso_profile_upgrade_privilege_snapshot) is distinct from true then
    raise exception 'profile_upgrade_legacy_update_privileges_required';
  end if;
end;
$legacy_privileges$;

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data
) values
  ('91000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','profile-legacy-edit@upgrade.test',
   '{"provider":"apple","providers":["apple"]}',
   '{"full_name":"Provider Original","avatar_url":"https://provider.example/old-one.png"}'),
  ('91000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','profile-legacy-removal@upgrade.test',
   '{"provider":"apple","providers":["apple"]}',
   '{"full_name":"Legacy Removal","avatar_url":"https://provider.example/old-two.png"}'),
  ('91000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','profile-legacy-same@upgrade.test',
   '{"provider":"apple","providers":["apple"]}',
   '{"full_name":"Legacy Same","avatar_url":"https://provider.example/old-three.png"}');

-- A real synthetic Auth session predates the upgrade. The post-upgrade test
-- registers its DOSO terminal; absence of a terminal is not absence of Auth.
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',now(),now());

-- Reproduce unknown historical manual editing/removal. The third account's
-- values equal metadata: equality cannot prove that a user never confirmed it.
update public.profiles
set display_name='Legacy Manual Name', avatar_url='https://provider.example/manual.png'
where id='91000000-0000-4000-8000-000000000001';
update public.profiles set avatar_url=null
where id='91000000-0000-4000-8000-000000000002';

create table private.doso_profile_upgrade_snapshot as
select id, username, display_name, avatar_url, created_at, updated_at
from public.profiles
where id in (
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000003'
);
