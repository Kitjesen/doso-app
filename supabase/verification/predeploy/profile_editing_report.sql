-- Aggregate-only inspection. Equal metadata values are NOT proof of provenance.
-- This report makes no deployment approval decision and writes no user data.
begin isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='5s';

do $preconditions$
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'profile_report_requires_read_only_transaction';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name in ('display_name_managed_by_user','avatar_managed_by_user')
  ) then
    raise exception 'profile_report_requires_pre_migration_schema';
  end if;
end;
$preconditions$;

with candidates as (
  select p.display_name,p.avatar_url,
    coalesce(nullif(u.raw_user_meta_data ->> 'display_name',''),
      nullif(u.raw_user_meta_data ->> 'full_name',''),
      nullif(u.raw_user_meta_data ->> 'username',''),
      split_part(coalesce(u.email,''),'@',1),'') as metadata_display_name,
    u.raw_user_meta_data ->> 'avatar_url' as metadata_avatar_url
  from public.profiles p join auth.users u on u.id=p.id
)
select now() as checked_at,
  (select count(*) from auth.users) as auth_user_count,
  (select count(*) from public.profiles) as profile_count,
  count(*) as joined_profile_count,
  count(*) filter (where display_name is distinct from metadata_display_name)
    as display_name_differs_from_current_metadata,
  count(*) filter (where avatar_url is distinct from metadata_avatar_url)
    as avatar_differs_from_current_metadata
from candidates;

commit;
