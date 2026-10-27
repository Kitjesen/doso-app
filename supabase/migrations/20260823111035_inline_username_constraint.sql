alter table public.profiles
  drop constraint profiles_username_format_check;

-- Keep row-level profile updates independent from EXECUTE privileges on the
-- private normalization helper. The canonical regex already rejects spaces,
-- uppercase characters, punctuation, and out-of-range lengths.
alter table public.profiles
  add constraint profiles_username_format_check
    check (username ~ '^[a-z0-9_]{3,24}$');
