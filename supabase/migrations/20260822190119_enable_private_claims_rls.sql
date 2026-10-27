alter table private.device_claims enable row level security;

create index if not exists device_claims_consumed_by_idx
  on private.device_claims(consumed_by)
  where consumed_by is not null;

comment on table private.device_claims is
  'One-time physical device claim digests. RLS is enabled as defense in depth; only trusted service-role Edge Functions receive table privileges.';
