drop function public.list_my_login_methods();
drop function public.admin_list_user_identities(uuid);

create function public.list_my_login_methods()
returns table (
  registry_id uuid,
  provider_key text,
  kind text,
  email_verified boolean,
  linked_at timestamptz,
  provider_last_sign_in_at timestamptz,
  last_observed_at timestamptz,
  unlinked_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_account_active() then
    raise exception 'account is not active' using errcode = 'P0001';
  end if;
  if not private.is_session_active() then
    raise exception 'current session is not active' using errcode = 'P0001';
  end if;

  return query
  select ai.id, ai.provider_key, private.external_identity_kind(ai.provider_key),
         case
           when private.external_identity_kind(ai.provider_key) = 'email'
             then users.email_confirmed_at is not null
           else ai.email_verified
         end,
         ai.linked_at, ai.provider_last_sign_in_at,
         ai.last_observed_at, ai.unlinked_at,
         case when ai.unlinked_at is null then 'active' else 'unlinked' end
  from private.account_identities as ai
  join auth.users as users on users.id = ai.user_id
  where ai.user_id = auth.uid()
  order by ai.linked_at desc, ai.id;
end;
$$;

create function public.admin_list_user_identities(p_user_id uuid)
returns table (
  registry_id uuid,
  provider_key text,
  kind text,
  email_verified boolean,
  linked_at timestamptz,
  provider_last_sign_in_at timestamptz,
  last_observed_at timestamptz,
  unlinked_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  return query
  select ai.id, ai.provider_key, private.external_identity_kind(ai.provider_key),
         case
           when private.external_identity_kind(ai.provider_key) = 'email'
             then users.email_confirmed_at is not null
           else ai.email_verified
         end,
         ai.linked_at, ai.provider_last_sign_in_at,
         ai.last_observed_at, ai.unlinked_at,
         case when ai.unlinked_at is null then 'active' else 'unlinked' end
  from private.account_identities as ai
  join auth.users as users on users.id = ai.user_id
  where ai.user_id = p_user_id
  order by ai.linked_at desc, ai.id;
end;
$$;

revoke all on function public.list_my_login_methods() from public, anon;
revoke all on function public.admin_list_user_identities(uuid) from public, anon, authenticated;
grant execute on function public.list_my_login_methods() to authenticated;
grant execute on function public.admin_list_user_identities(uuid) to service_role;

comment on function public.list_my_login_methods() is
  'Safe caller-owned login-method inventory using the canonical registry_id/provider_last_sign_in_at contract.';
comment on function public.admin_list_user_identities(uuid) is
  'Service-role-only safe login-method inventory using the canonical registry_id/provider_last_sign_in_at contract.';

notify pgrst, 'reload schema';
