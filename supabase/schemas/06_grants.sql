--
-- Grants
-- This file declares all grants and default privileges for the public schema.
--

-- Schema usage
grant usage on schema public to postgres;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Private schema: holds the tenancy helpers that RLS policies call. It is not
-- exposed through the API, but signed-in requests need USAGE to evaluate policies.
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

revoke all on function private.current_organisation_id() from public;
revoke all on function private.current_organisation_id() from anon;
grant execute on function private.current_organisation_id() to authenticated;
grant execute on function private.current_organisation_id() to service_role;

revoke all on function private.current_membership_role() from public;
revoke all on function private.current_membership_role() from anon;
grant execute on function private.current_membership_role() to authenticated;
grant execute on function private.current_membership_role() to service_role;

revoke all on function public.get_user_id_by_email(text) from public;
grant all on function public.get_user_id_by_email(text) to service_role;

grant all on function public.handle_new_user() to anon;
grant all on function public.handle_new_user() to authenticated;
grant all on function public.handle_new_user() to service_role;

grant all on function public.handle_update_user() to anon;
grant all on function public.handle_update_user() to authenticated;
grant all on function public.handle_update_user() to service_role;

revoke all on function public.handle_organisation_created() from public;
revoke all on function public.handle_organisation_created() from anon;
revoke all on function public.handle_organisation_created() from authenticated;
grant all on function public.handle_organisation_created() to service_role;

grant all on function public.is_admin() to anon;
grant all on function public.is_admin() to authenticated;
grant all on function public.is_admin() to service_role;

-- Table grants

-- Tenancy tables: read-only for signed-in users (RLS limits it to their own
-- organisation); only the service role creates organisations and memberships.
revoke all on table public.organisations from anon;
revoke all on table public.organisations from authenticated;
grant select on table public.organisations to authenticated;
grant all on table public.organisations to service_role;

revoke all on table public.memberships from anon;
revoke all on table public.memberships from authenticated;
grant select on table public.memberships to authenticated;
grant all on table public.memberships to service_role;

grant all on table public.sales to anon;
grant all on table public.sales to authenticated;
grant all on table public.sales to service_role;

grant all on table public.configuration to anon;
grant all on table public.configuration to authenticated;
grant all on table public.configuration to service_role;

grant all on table public.init_state to anon;
grant all on table public.init_state to authenticated;
grant all on table public.init_state to service_role;

-- Sequence grants
revoke all on sequence public.memberships_id_seq from anon;
revoke all on sequence public.memberships_id_seq from authenticated;
grant all on sequence public.memberships_id_seq to service_role;

grant all on sequence public.sales_id_seq to anon;
grant all on sequence public.sales_id_seq to authenticated;
grant all on sequence public.sales_id_seq to service_role;

-- Default privileges
alter default privileges for role postgres in schema public grant all on sequences to postgres;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant all on sequences to authenticated;
alter default privileges for role postgres in schema public grant all on sequences to service_role;

alter default privileges for role postgres in schema public grant all on functions to postgres;
alter default privileges for role postgres in schema public grant all on functions to anon;
alter default privileges for role postgres in schema public grant all on functions to authenticated;
alter default privileges for role postgres in schema public grant all on functions to service_role;

alter default privileges for role postgres in schema public grant all on tables to postgres;
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on tables to authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;

-- Role helpers (02_roles.sql)
revoke all on function private.current_sales_id() from public;
revoke all on function private.current_sales_id() from anon;
grant execute on function private.current_sales_id() to authenticated;
grant execute on function private.current_sales_id() to service_role;

revoke all on function private.sees_all_records() from public;
revoke all on function private.sees_all_records() from anon;
grant execute on function private.sees_all_records() to authenticated;
grant execute on function private.sees_all_records() to service_role;

revoke all on function private.is_case_staff() from public;
revoke all on function private.is_case_staff() from anon;
grant execute on function private.is_case_staff() to authenticated;
grant execute on function private.is_case_staff() to service_role;

revoke all on function private.can_access_assigned(uuid, bigint) from public;
revoke all on function private.can_access_assigned(uuid, bigint) from anon;
grant execute on function private.can_access_assigned(uuid, bigint) to authenticated;
grant execute on function private.can_access_assigned(uuid, bigint) to service_role;

-- Staff with roles: signed-in users only (RLS limits it to their organisation)
revoke all on table public.sales_summary from anon;
revoke all on table public.sales_summary from authenticated;
grant select on table public.sales_summary to authenticated;
grant select on table public.sales_summary to service_role;

