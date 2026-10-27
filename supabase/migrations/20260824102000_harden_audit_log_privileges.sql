-- `audit_logs` is append-only application data. Supabase's schema defaults can
-- leave broader table and identity-sequence privileges in place even after a
-- narrower GRANT, so reset the ACL before establishing the final contract.
revoke all privileges on table public.audit_logs
  from public, anon, authenticated, service_role;

grant select, insert on table public.audit_logs to service_role;

-- INSERT into the identity column needs sequence USAGE. SELECT/UPDATE are not
-- required by the service-role audit append path and would expose currval or
-- nextval/setval operations.
revoke all privileges on sequence public.audit_logs_id_seq
  from public, anon, authenticated, service_role;

grant usage on sequence public.audit_logs_id_seq to service_role;
