begin;

do $sentinel$
begin
  if pg_catalog.to_regclass('private.doso_upgrade_harness_sentinel') is null
     or pg_catalog.to_regclass('private.doso_profile_upgrade_privilege_snapshot') is null then
    raise exception 'upgrade_harness_sentinel_required';
  end if;
  if not exists (
    select 1 from private.doso_upgrade_harness_sentinel
    where scenario='pre_profile_editing'
  ) then
    raise exception 'upgrade_harness_scenario_mismatch';
  end if;
end;
$sentinel$;

create extension if not exists pgtap with schema extensions;
select no_plan();

select results_eq(
  $$select avatar_direct_update,nickname_direct_update
    from private.doso_profile_upgrade_privilege_snapshot$$,
  $$values (true,true)$$,
  'upgrade starts from real legacy avatar and nickname direct-update grants'
);
select ok(
  not has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE')
  and has_column_privilege('authenticated','public.profiles','display_name','UPDATE'),
  'upgrade revokes legacy avatar direct updates without breaking nickname recovery'
);
select ok(
  not has_column_privilege('authenticated','public.profiles','avatar_lifecycle_epoch','UPDATE')
  and not has_column_privilege('authenticated','public.profiles','display_name_managed_by_user','UPDATE')
  and not has_column_privilege('authenticated','public.profiles','avatar_managed_by_user','UPDATE'),
  'upgraded lifecycle and provenance columns cannot be written directly by clients'
);

select is(
  (select count(*) from private.doso_profile_upgrade_snapshot),
  3::bigint,
  'upgrade fixture contains three real pre-migration profiles'
);
select results_eq(
  $$select p.id,p.username,p.display_name,p.avatar_url,p.created_at,p.updated_at
    from public.profiles p join private.doso_profile_upgrade_snapshot s using(id) order by p.id$$,
  $$select id,username,display_name,avatar_url,created_at,updated_at
    from private.doso_profile_upgrade_snapshot order by id$$,
  'migration preserves existing profile values and timestamps without rewriting user data'
);
select ok(
  (select bool_and(p.display_name_managed_by_user and p.avatar_managed_by_user)
   from public.profiles p join private.doso_profile_upgrade_snapshot s using(id)),
  'all pre-migration values are protected, including an explicitly removed avatar'
);
select results_eq(
  $$select a.attname::text,pg_catalog.pg_get_expr(d.adbin,d.adrelid)
    from pg_catalog.pg_attribute a join pg_catalog.pg_attrdef d
      on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.profiles'::regclass
      and a.attname in ('display_name_managed_by_user','avatar_managed_by_user')
    order by a.attname$$,
  $$values ('avatar_managed_by_user'::text,'false'::text),
           ('display_name_managed_by_user'::text,'false'::text)$$,
  'final defaults remain provider-managed for future profiles'
);

update auth.users
set raw_user_meta_data=raw_user_meta_data ||
  '{"full_name":"Provider Attempted Override","avatar_url":"https://provider.example/new.png","display_name_managed_by_user":false,"avatar_managed_by_user":false}'::jsonb
where id in (select id from private.doso_profile_upgrade_snapshot);
select results_eq(
  $$select p.id,p.username,p.display_name,p.avatar_url
    from public.profiles p join private.doso_profile_upgrade_snapshot s using(id) order by p.id$$,
  $$select id,username,display_name,avatar_url
    from private.doso_profile_upgrade_snapshot order by id$$,
  'provider refresh and forged metadata cannot replace, resurrect or change legacy presentation fields'
);
select ok(
  (select bool_and(p.display_name_managed_by_user and p.avatar_managed_by_user)
   from public.profiles p join private.doso_profile_upgrade_snapshot s using(id)),
  'metadata cannot reset legacy protection flags'
);

insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data
) values (
  '92000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','profile-new@upgrade.test',
  '{"provider":"apple","providers":["apple"]}',
  '{"full_name":"New Provider","avatar_url":"https://provider.example/fresh.png","display_name_managed_by_user":true,"avatar_managed_by_user":true}'
);
select results_eq(
  $$select display_name,avatar_url,display_name_managed_by_user,avatar_managed_by_user
    from public.profiles where id='92000000-0000-4000-8000-000000000001'$$,
  $$values ('New Provider'::text,'https://provider.example/fresh.png'::text,false,false)$$,
  'a post-migration provider profile syncs normally and ignores forged ownership metadata'
);
update auth.users
set raw_user_meta_data='{"full_name":"New Provider Updated","avatar_url":"https://provider.example/fresh-updated.png"}'::jsonb
where id='92000000-0000-4000-8000-000000000001';
select results_eq(
  $$select display_name,avatar_url from public.profiles
    where id='92000000-0000-4000-8000-000000000001'$$,
  $$values ('New Provider Updated'::text,'https://provider.example/fresh-updated.png'::text)$$,
  'post-upgrade provider metadata updates continue to reach untouched new profiles'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93000000-0000-4000-8000-000000000001"}',true);
select lives_ok(
  $$select public.register_account_terminal('profile-upgrade-install','android','Upgrade Emulator','1.0','DOSO')$$,
  'legacy account can register an active session after upgrade'
);
select ok(
  private.is_session_active(),
  'direct-write upgrade checks run under an active registered session'
);
select lives_ok(
  $$update public.profiles set display_name='Direct Upgrade Name' where id=auth.uid()$$,
  'legacy nickname direct-update recovery still works after upgrade'
);
select is(
  (select display_name from public.profiles where id=auth.uid()),
  'Direct Upgrade Name'::text,
  'nickname update actually affects the visible owner row, not zero RLS rows'
);
select throws_ok(
  $$update public.profiles set avatar_url=null where id=auth.uid()$$,
  '42501',null,
  'legacy avatar direct-update grant is no longer usable after upgrade'
);
select is(
  (select avatar_url from public.profiles where id=auth.uid()),
  'https://provider.example/manual.png'::text,
  'rejected direct avatar write preserves the migrated legacy avatar'
);
select lives_ok(
  $$select public.update_my_profile('91000000-0000-4000-8000-000000000001',
    (select username from public.profiles where id=auth.uid()),'User Edited After Upgrade','keep',null)$$,
  'legacy protection does not prevent the owner from explicitly editing their nickname'
);
reset role;
select results_eq(
  $$select display_name,avatar_url from public.profiles
    where id='91000000-0000-4000-8000-000000000001'$$,
  $$values ('User Edited After Upgrade'::text,'https://provider.example/manual.png'::text)$$,
  'explicit post-upgrade nickname editing preserves the legacy avatar'
);

-- Prove this scenario actually exercises the Auth authority tail, rather than
-- going green on the older terminal-only helper. Only synthetic fixture data.
delete from auth.sessions where id='93000000-0000-4000-8000-000000000001';
select ok(
  exists (select 1 from public.account_terminals
    where auth_session_id='93000000-0000-4000-8000-000000000001' and revoked_at is null),
  'the upgrade authority probe keeps the DOSO terminal active'
);
set local role authenticated;
select throws_ok(
  $$select public.update_my_profile('91000000-0000-4000-8000-000000000001',
    'must_not_save','Must Not Save','keep',null)$$,
  'P0001','account_or_session_inactive',
  'post-upgrade profile editing rejects a deleted Auth session with an active terminal'
);
select throws_ok(
  $$select public.register_account_terminal('profile-upgrade-install','android','Upgrade Emulator','1.0','DOSO')$$,
  '42501','auth_session_inactive',
  'post-upgrade registration cannot recreate authority for a deleted Auth session'
);
reset role;
select is(
  (select display_name from public.profiles where id='91000000-0000-4000-8000-000000000001'),
  'User Edited After Upgrade'::text,
  'rejected post-upgrade operations preserve the last saved profile'
);

select * from finish();
rollback;
