-- Version-controlled custom DDL on Supabase-managed auth/storage schemas.
-- The normal CLI schema dump excludes these schemas, so restore this artifact
-- only after the public/private application schema and managed schemas exist.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

-- No custom storage-schema object exists in this release. Keep this explicit
-- statement in the reviewed artifact so future storage DDL cannot be omitted
-- silently from the backup/restore path.

-- The pre-release production head has no sync_auth_identity_projection trigger
-- yet. Migration 20260824090000 creates that function and trigger after this
-- eight-migration backup is restored and the five-migration release tail runs.
