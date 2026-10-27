begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'public', 'update_my_profile', array['uuid','text','text','text','text'],
  'authenticated profile editing RPC exists'
);
select has_function(
  'public', 'prepare_my_profile_avatar_cleanup', array['uuid','text'],
  'authenticated avatar cleanup preparation RPC exists'
);
select ok(
  has_function_privilege('authenticated','public.prepare_my_profile_avatar_cleanup(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.prepare_my_profile_avatar_cleanup(uuid,text)','EXECUTE')
  and not has_function_privilege('service_role','public.prepare_my_profile_avatar_cleanup(uuid,text)','EXECUTE')
  and not has_table_privilege('authenticated','private.profile_avatar_retirements','SELECT')
  and not has_table_privilege('authenticated','private.profile_avatar_retirements','INSERT')
  and not has_table_privilege('authenticated','private.profile_avatar_retirements','UPDATE')
  and not has_table_privilege('authenticated','private.profile_avatar_retirements','DELETE'),
  'cleanup is authenticated-only and its retirement ledger is not client-writable or readable'
);
select is(
  (select count(*) from pg_policies
   where schemaname='storage' and tablename='objects' and permissive='RESTRICTIVE'
     and policyname in ('profile_avatars_retired_insert_guard','profile_avatars_retired_delete_guard')),
  2::bigint,
  'both avatar retirement guards are restrictive, not permissive'
);
select ok(
  has_function_privilege('authenticated','public.update_my_profile(uuid,text,text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.update_my_profile(uuid,text,text,text,text)','EXECUTE')
  and not has_function_privilege('service_role','public.update_my_profile(uuid,text,text,text,text)','EXECUTE'),
  'only authenticated clients can execute the self-profile RPC'
);
select ok(
  has_column_privilege('authenticated','public.profiles','display_name','UPDATE')
  and not has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE'),
  'Apple display-name recovery remains available while avatar updates require the RPC'
);
select ok(
  not has_column_privilege('authenticated','public.profiles','display_name_managed_by_user','UPDATE')
  and not has_column_privilege('authenticated','public.profiles','avatar_managed_by_user','UPDATE'),
  'clients cannot forge or reset server-owned profile provenance'
);
select is(
  (select public from storage.buckets where id='profile-avatars'),
  false,
  'avatar bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id='profile-avatars'),
  3145728::bigint,
  'avatar bucket enforces the 3 MiB limit'
);
select results_eq(
  $$select unnest(allowed_mime_types) from storage.buckets where id='profile-avatars' order by 1$$,
  $$values ('image/jpeg'::text),('image/png'::text)$$,
  'avatar bucket permits only JPEG and PNG'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname like 'profile_avatars_%' and cmd='UPDATE'
  ),
  'avatar object names are immutable because no owner update policy exists'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','profile-one@doso.test',crypt('StrongPass123',gen_salt('bf')),now(),
 '{"provider":"email","providers":["email"]}','{"username":"profile_one","display_name":"One"}',now(),now()),
('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','profile-two@doso.test',crypt('StrongPass123',gen_salt('bf')),now(),
 '{"provider":"email","providers":["email"]}','{"username":"profile_two","display_name":"Two"}',now(),now()),
('33333333-3333-4333-8333-333333333333','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','verified@doso.test',crypt('StrongPass123',gen_salt('bf')),now(),
 '{"provider":"email","providers":["email"]}','{"display_name":"Verified"}',now(),now()),
('44444444-4444-4444-8444-444444444444','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','provider@doso.test',crypt('StrongPass123',gen_salt('bf')),now(),
 '{"provider":"apple","providers":["apple"]}',
 '{"full_name":"Provider Original","avatar_url":"https://provider.example/original.png"}',now(),now()),
('55555555-5555-4555-8555-555555555555','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated',null,crypt('StrongPass123',gen_salt('bf')),now(),
 '{"provider":"apple","providers":["apple"]}','{"full_name":"No Email Provider"}',now(),now());

-- Auth authority exists independently of DOSO terminal registration. Keep these
-- rows when revoking a terminal below so that test isolates terminal revocation.
insert into auth.sessions(id,user_id,created_at,updated_at) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',now(),now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',now(),now()),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333',now(),now()),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444',now(),now());

select results_eq(
  $$select display_name_managed_by_user,avatar_managed_by_user from public.profiles
    where id='44444444-4444-4444-8444-444444444444'$$,
  $$values (false,false)$$,
  'an untouched provider profile starts with provider-managed nickname and avatar'
);
-- A JWT role must not misclassify the SECURITY DEFINER metadata sync as a
-- direct user edit. User-editable metadata cannot forge ownership flags either.
select set_config('request.jwt.claims',
 '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}',true);
update auth.users
set raw_user_meta_data = raw_user_meta_data ||
  '{"full_name":"Provider Updated","avatar_url":"https://provider.example/updated.png","display_name_managed_by_user":true,"avatar_managed_by_user":true}'::jsonb
where id='44444444-4444-4444-8444-444444444444';
select results_eq(
  $$select display_name,avatar_url,display_name_managed_by_user,avatar_managed_by_user
    from public.profiles where id='44444444-4444-4444-8444-444444444444'$$,
  $$values ('Provider Updated'::text,'https://provider.example/updated.png'::text,false,false)$$,
  'untouched provider fields continue syncing despite authenticated JWT claims and forged metadata flags'
);
update auth.users
set raw_user_meta_data = '{"full_name":"Provider Updated"}'::jsonb
where id='44444444-4444-4444-8444-444444444444';
select results_eq(
  $$select display_name,avatar_url from public.profiles
    where id='44444444-4444-4444-8444-444444444444'$$,
  $$values ('Provider Updated'::text,'https://provider.example/updated.png'::text)$$,
  'a provider update omitting the avatar retains the previous provider avatar'
);
update auth.users set raw_user_meta_data='{}'::jsonb
where id='55555555-5555-4555-8555-555555555555';
select is(
  (select display_name from public.profiles where id='55555555-5555-4555-8555-555555555555'),
  'No Email Provider'::text,
  'a no-email provider update omitting its name retains the previous display name'
);

set local role authenticated;
select lives_ok(
  $$select public.register_account_terminal('provider-install','ios','iPhone','1.0','DOSO')$$,
  'provider account registers an active terminal for explicit profile edits'
);
select lives_ok(
  $$update public.profiles set display_name='Provider Updated'
    where id='44444444-4444-4444-8444-444444444444'$$,
  'legacy Apple recovery can explicitly confirm even the existing nickname'
);
reset role;
update auth.users
set raw_user_meta_data = raw_user_meta_data ||
  '{"full_name":"Provider After Confirmation","avatar_url":"https://provider.example/later.png"}'::jsonb
where id='44444444-4444-4444-8444-444444444444';
select results_eq(
  $$select display_name,avatar_url,display_name_managed_by_user,avatar_managed_by_user
    from public.profiles where id='44444444-4444-4444-8444-444444444444'$$,
  $$values ('Provider Updated'::text,'https://provider.example/later.png'::text,true,false)$$,
  'explicit nickname confirmation is preserved while the untouched avatar still syncs'
);
set local role authenticated;
select lives_ok(
  $$select public.update_my_profile('44444444-4444-4444-8444-444444444444','provider_editor','Provider Updated','remove',null)$$,
  'profile RPC can explicitly remove a provider avatar'
);
reset role;
update auth.users
set raw_user_meta_data = raw_user_meta_data ||
  '{"full_name":"Provider After Removal","avatar_url":"https://provider.example/restored.png"}'::jsonb
where id='44444444-4444-4444-8444-444444444444';
select results_eq(
  $$select display_name,avatar_url,display_name_managed_by_user,avatar_managed_by_user
    from public.profiles where id='44444444-4444-4444-8444-444444444444'$$,
  $$values ('Provider Updated'::text,null::text,true,true)$$,
  'provider sync cannot restore an avatar explicitly removed by the user'
);

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
select lives_ok(
  $$select public.register_account_terminal('profile-one-install','android','Pixel','1.0','DOSO')$$,
  'first account registers an active terminal'
);
select throws_ok(
  $$select public.update_my_profile('22222222-2222-4222-8222-222222222222','wrong_account','Wrong','keep',null)$$,
  '42501','profile_identity_mismatch','expected account id prevents a late session switch from saving to another account'
);
select lives_ok(
  $$select (public.update_my_profile('11111111-1111-4111-8111-111111111111','renamed_one','森哥','keep',null)).username$$,
  'active owner can rename username and display name'
);
reset role;

select results_eq(
  $$select username,display_name,username_provenance::text,username_claimed_at is not null
    from public.profiles where id='11111111-1111-4111-8111-111111111111'$$,
  $$values ('renamed_one'::text,'森哥'::text,'manual_claim'::text,true)$$,
  'user rename becomes a fresh manual claim rather than retaining registration provenance'
);
select is(
  (select metadata from public.audit_logs where actor_user_id='11111111-1111-4111-8111-111111111111'
   and action='profile.updated' order by id desc limit 1),
  '{"avatarChanged": false, "displayNameChanged": true, "usernameChanged": true}'::jsonb,
  'profile update audit records changed fields without personal values'
);

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
select lives_ok(
  $$select public.register_account_terminal('profile-two-install','ios','iPhone','1.0','DOSO')$$,
  'second account registers an active terminal'
);
select throws_ok(
  $$select public.update_my_profile('22222222-2222-4222-8222-222222222222','renamed_one','Collision','keep',null)$$,
  'P0001','username_taken','duplicate username is rejected with a stable error'
);
select throws_ok(
  $$select public.update_my_profile('22222222-2222-4222-8222-222222222222','atomic_should_rollback',E'bad\nname','keep',null)$$,
  '22023','display_name_invalid','invalid display name aborts the whole edit'
);
select throws_ok(
  $$select public.update_my_profile('22222222-2222-4222-8222-222222222222','profile_two','Two',null,null)$$,
  '22023','avatar_action_invalid','null avatar action fails closed'
);
reset role;
select is(
  (select username from public.profiles where id='22222222-2222-4222-8222-222222222222'),
  'profile_two'::text,
  'validation failure leaves the username unchanged atomically'
);

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok(
  $$select public.admin_verify_username(
    '11111111-1111-4111-8111-111111111111','admin',
    '33333333-3333-4333-8333-333333333333','profile test','profile-edit-admin-verify'
  )$$,
  'legacy inferred username can still follow the existing admin verification path'
);
reset role;
create temporary table profile_edit_verified_before as
select username_claimed_at from public.profiles
where id='33333333-3333-4333-8333-333333333333';
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}',true);
select lives_ok(
  $$select public.register_account_terminal('verified-install','android','Pixel','1.0','DOSO')$$,
  'admin-verified account registers an active terminal'
);
select lives_ok(
  $$select public.update_my_profile(
    '33333333-3333-4333-8333-333333333333','verified_renamed','Verified','keep',null
  )$$,
  'admin-verified owner can rename through the profile RPC'
);
reset role;
select results_eq(
  $$select username,username_provenance::text,
      username_claimed_at > (select username_claimed_at from profile_edit_verified_before)
    from public.profiles where id='33333333-3333-4333-8333-333333333333'$$,
  $$values ('verified_renamed'::text,'manual_claim'::text,true)$$,
  'renaming an admin-verified username drops verification provenance and refreshes claim time'
);

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
insert into storage.objects(bucket_id,name,metadata)
values(
  'profile-avatars',
  '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png',
  '{"mimetype":"image/png","size":9}'::jsonb
);
select lives_ok(
  $$select public.update_my_profile(
    '11111111-1111-4111-8111-111111111111',
    'renamed_one','森哥','replace',
    'profile-avatars/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png'
  )$$,
  'owner can attach an existing private avatar object'
);
select throws_ok(
  $$select public.update_my_profile(
    '11111111-1111-4111-8111-111111111111',
    'renamed_one','森哥','replace',
    'profile-avatars/22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444.png'
  )$$,
  '22023','avatar_path_invalid','foreign avatar paths are rejected'
);
select lives_ok(
  $$delete from storage.objects
    where bucket_id='profile-avatars'
      and name='11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png'$$,
  'deleting an unprepared current avatar is safely filtered by RLS'
);
select ok(
  exists (
    select 1 from storage.objects
    where bucket_id='profile-avatars'
      and name='11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png'
  ),
  'currently referenced avatar remains present'
);
select is(
  public.prepare_my_profile_avatar_cleanup(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png'
  )->>'status',
  'protected-current'::text,
  'cleanup preparation protects the currently referenced avatar'
);
reset role;
select is(
  (select count(*) from private.profile_avatar_retirements
   where owner_id='11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'protecting the current avatar creates no retirement'
);
set local role authenticated;
select lives_ok(
  $$insert into storage.objects(bucket_id,name,metadata)
    select 'profile-avatars',
      '11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-' || lpad(i::text,12,'0') || '.jpg',
      '{"mimetype":"image/jpeg","size":6}'::jsonb
    from generate_series(1,19) as series(i)$$,
  'owner can fill the immutable avatar quota to twenty objects'
);
select is(
  (select count(*) from storage.objects
   where bucket_id='profile-avatars'
     and (storage.foldername(name))[1]='11111111-1111-4111-8111-111111111111'),
  20::bigint,
  'per-owner avatar storage reaches but does not exceed twenty objects'
);
select throws_ok(
  $$insert into storage.objects(bucket_id,name,metadata) values(
    'profile-avatars',
    '11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999998.jpg',
    '{"mimetype":"image/jpeg","size":6}'::jsonb
  )$$,
  'P0001','avatar_quota_exceeded','the twenty-first avatar object is rejected fail closed'
);
select ok(
  exists (
    select 1 from storage.objects
    where bucket_id='profile-avatars'
      and name='11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png'
  ),
  'quota enforcement never removes the currently referenced avatar'
);
select is(
  public.prepare_my_profile_avatar_cleanup(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-000000000001.jpg'
  )->>'status',
  'retired'::text,
  'an unreferenced owner object can be reserved for cleanup'
);
select is(
  public.prepare_my_profile_avatar_cleanup(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-000000000001.jpg'
  )->>'status',
  'retired'::text,
  'repeating preparation before deletion is idempotent'
);
select is(
  public.prepare_my_profile_avatar_cleanup(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999997.png'
  )->>'status',
  'object-missing'::text,
  'a missing owner object is reported without creating a retirement'
);
select throws_ok(
  $$select public.prepare_my_profile_avatar_cleanup(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444.png')$$,
  '22023','avatar_path_invalid','cleanup cannot reserve a foreign owner path'
);
reset role;
select is(
  (select count(*) from private.profile_avatar_retirements
   where owner_id='11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'idempotent, protected, missing and foreign preparation creates only one retirement'
);
select is(
  (select avatar_lifecycle_epoch from public.profiles
   where id='11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'only the first successful retirement advances the lifecycle epoch'
);
-- Deliberately permissive test-only policies must not bypass restrictive guards.
create policy profile_test_permissive_insert on storage.objects for insert to authenticated
with check (bucket_id='profile-avatars');
create policy profile_test_permissive_delete on storage.objects for delete to authenticated
using (bucket_id='profile-avatars');
set local role authenticated;
select results_eq(
  $$with removed as (delete from storage.objects where bucket_id='profile-avatars'
    and name in (
      '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png',
      '11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-000000000002.jpg'
    ) returning 1) select count(*) from removed$$,
  $$values (0::bigint)$$,
  'a permissive policy cannot delete current or unprepared owner objects'
);
select throws_ok(
  $$select public.update_my_profile('11111111-1111-4111-8111-111111111111','renamed_one','森哥','replace',
    'profile-avatars/11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-000000000001.jpg')$$,
  '22023','avatar_retired','a retired path cannot become the current avatar even while its object exists'
);
select results_eq(
  $$with removed as (delete from storage.objects where bucket_id='profile-avatars'
    and name='11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-000000000001.jpg'
    returning 1) select count(*) from removed$$,
  $$values (1::bigint)$$,
  'the prepared owner object can be deleted exactly once'
);
select is(
  public.prepare_my_profile_avatar_cleanup(
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-000000000001.jpg'
  )->>'status',
  'retired-missing'::text,
  'a retry after metadata deletion preserves the durable retirement'
);
-- Quota now has a free slot: INSERT denial below must be the retirement guard,
-- not quota exhaustion or a duplicate object name.
select throws_ok(
  $$insert into storage.objects(bucket_id,name,metadata) values('profile-avatars',
    '11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-000000000001.jpg',
    '{"mimetype":"image/jpeg","size":6}'::jsonb)$$,
  '42501','new row violates row-level security policy for table "objects"',
  'a permissive policy cannot reupload a retired path after deletion'
);
reset role;
drop policy profile_test_permissive_insert on storage.objects;
drop policy profile_test_permissive_delete on storage.objects;

update auth.users
set raw_user_meta_data = raw_user_meta_data ||
  '{"display_name":"Provider Reset","avatar_url":"https://provider.example/avatar.png"}'::jsonb,
  updated_at = pg_catalog.clock_timestamp()
where id='11111111-1111-4111-8111-111111111111';
select results_eq(
  $$select display_name,avatar_url from public.profiles
    where id='11111111-1111-4111-8111-111111111111'$$,
  $$values (
    '森哥'::text,
    'profile-avatars/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png'::text
  )$$,
  'later provider metadata updates preserve the user-managed nickname and avatar'
);

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
select is(
  (select count(*) from storage.objects where bucket_id='profile-avatars'),
  0::bigint,
  'another active account cannot read the first account avatar object'
);
select throws_ok(
  $$insert into storage.objects(bucket_id,name) values(
    'profile-avatars',
    '11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666.jpg'
  )$$,
  '42501','avatar_owner_mismatch',
  'another active account cannot write into the first account avatar folder'
);
reset role;

update public.account_terminals
set revoked_at=now(),revocation_reason='test'
where auth_session_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
select throws_ok(
  $$select public.update_my_profile('11111111-1111-4111-8111-111111111111','after_revoke','Blocked','keep',null)$$,
  'P0001','account_or_session_inactive','revoked session cannot edit the profile'
);
select throws_ok(
  $$insert into storage.objects(bucket_id,name) values(
    'profile-avatars',
    '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg'
  )$$,
  '42501','new row violates row-level security policy for table "objects"',
  'revoked session cannot upload another avatar'
);
reset role;

-- Leave account B's terminal active. A mismatched or deleted Auth row must not
-- be mistaken for the terminal-revoked case above. All synthetic changes roll back.
update auth.sessions set user_id='44444444-4444-4444-8444-444444444444'
where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
select throws_ok(
  $$select public.update_my_profile('22222222-2222-4222-8222-222222222222','profile_two','Two','keep',null)$$,
  'P0001','account_or_session_inactive','an Auth session owned by another user cannot edit the claimed profile'
);
select is(
  (select count(*) from public.profiles where id='22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'an Auth session owner mismatch also hides the profile through RLS'
);
reset role;
delete from auth.sessions where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select ok(
  exists (select 1 from public.account_terminals
    where auth_session_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and revoked_at is null),
  'the Auth-deletion negative case retains an active DOSO terminal'
);
set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
select throws_ok(
  $$select public.update_my_profile('22222222-2222-4222-8222-222222222222','profile_two','Two','keep',null)$$,
  'P0001','account_or_session_inactive','deleting the Auth session denies profile edits despite an active terminal'
);
select throws_ok(
  $$select public.register_account_terminal('profile-two-install','ios','iPhone','1.0','DOSO')$$,
  '42501','auth_session_inactive','terminal re-registration cannot resurrect a deleted Auth session'
);
reset role;

select * from finish();
rollback;
