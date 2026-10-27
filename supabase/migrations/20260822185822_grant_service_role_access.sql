grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.devices to service_role;

comment on table public.profiles is
  'DOSO account profiles. User access is restricted by RLS; service_role is reserved for trusted backend administration.';
comment on table public.devices is
  'DOSO devices. User access is restricted by RLS; service_role is reserved for trusted backend administration.';
