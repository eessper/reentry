--
-- Row Level Security
-- This file declares RLS policies for all tables.
--
-- Tenancy rule: a tenant-owned row is visible and writable only when its
-- organisation_id matches the caller's organisation. A user with no
-- membership has no organisation, so they see nothing and can write nothing.
-- `(select private.current_organisation_id())` is wrapped in a sub-select so
-- Postgres evaluates it once per statement instead of once per row.
--
-- Roles narrow that further (helpers in 02_roles.sql). The policies for
-- people's records live with their tables: service users and their child
-- tables in 08_service_users.sql, case notes and actions in 11_case_notes.sql.
-- - org_admin and clinical_lead see every record in their organisation.
-- - key_worker sees only the service users assigned to them, and only the
--   rows attached to those.
-- - viewer sees no individual records: only their organisation, its staff
--   list and configuration.
--

-- Enable RLS on all tables
alter table public.organisations enable row level security;
alter table public.memberships enable row level security;
alter table public.sales enable row level security;
alter table public.configuration enable row level security;

-- Organisations: members can read their own organisation. Created by the service role only.
create policy "Members read their organisation" on public.organisations for select to authenticated
    using (id = (select private.current_organisation_id()));

-- Memberships: members can read memberships in their organisation. Managed by the service role only.
create policy "Members read memberships in their organisation" on public.memberships for select to authenticated
    using (organisation_id = (select private.current_organisation_id()));

-- Sales (staff profiles): readable within the organisation. Written by the users edge function (service role).
create policy "Tenant isolation" on public.sales for select to authenticated
    using (organisation_id = (select private.current_organisation_id()));

-- Configuration: one row per organisation; members read it, organisation admins update it.
-- Rows are created by the on_organisation_created trigger, so there is no insert policy.
create policy "Members read their configuration" on public.configuration for select to authenticated
    using (organisation_id = (select private.current_organisation_id()));
create policy "Organisation admins update their configuration" on public.configuration for update to authenticated
    using (organisation_id = (select private.current_organisation_id()) and public.is_admin())
    with check (organisation_id = (select private.current_organisation_id()) and public.is_admin());
