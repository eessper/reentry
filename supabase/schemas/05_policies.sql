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
-- Role-based restrictions (key workers, viewers) arrive in Session 2.
--

-- Enable RLS on all tables
alter table public.organisations enable row level security;
alter table public.memberships enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;

-- Organisations: members can read their own organisation. Created by the service role only.
create policy "Members read their organisation" on public.organisations for select to authenticated
    using (id = (select private.current_organisation_id()));

-- Memberships: members can read memberships in their organisation. Managed by the service role only.
create policy "Members read memberships in their organisation" on public.memberships for select to authenticated
    using (organisation_id = (select private.current_organisation_id()));

-- Companies
create policy "Tenant isolation" on public.companies for all to authenticated
    using (organisation_id = (select private.current_organisation_id()))
    with check (organisation_id = (select private.current_organisation_id()));

-- Contacts
create policy "Tenant isolation" on public.contacts for all to authenticated
    using (organisation_id = (select private.current_organisation_id()))
    with check (organisation_id = (select private.current_organisation_id()));

-- Contact Notes
create policy "Tenant isolation" on public.contact_notes for all to authenticated
    using (organisation_id = (select private.current_organisation_id()))
    with check (organisation_id = (select private.current_organisation_id()));

-- Deals
create policy "Tenant isolation" on public.deals for all to authenticated
    using (organisation_id = (select private.current_organisation_id()))
    with check (organisation_id = (select private.current_organisation_id()));

-- Deal Notes
create policy "Tenant isolation" on public.deal_notes for all to authenticated
    using (organisation_id = (select private.current_organisation_id()))
    with check (organisation_id = (select private.current_organisation_id()));

-- Sales (staff profiles): readable within the organisation. Written by the users edge function (service role).
create policy "Tenant isolation" on public.sales for select to authenticated
    using (organisation_id = (select private.current_organisation_id()));

-- Tags
create policy "Tenant isolation" on public.tags for all to authenticated
    using (organisation_id = (select private.current_organisation_id()))
    with check (organisation_id = (select private.current_organisation_id()));

-- Tasks
create policy "Tenant isolation" on public.tasks for all to authenticated
    using (organisation_id = (select private.current_organisation_id()))
    with check (organisation_id = (select private.current_organisation_id()));

-- Configuration: one row per organisation; members read it, organisation admins update it.
-- Rows are created by the on_organisation_created trigger, so there is no insert policy.
create policy "Members read their configuration" on public.configuration for select to authenticated
    using (organisation_id = (select private.current_organisation_id()));
create policy "Organisation admins update their configuration" on public.configuration for update to authenticated
    using (organisation_id = (select private.current_organisation_id()) and public.is_admin())
    with check (organisation_id = (select private.current_organisation_id()) and public.is_admin());

-- Favicons excluded domains: shared, non-sensitive reference data (email domains).
-- Readable by everyone signed in; writable only by the service role, so no tenant can change it for others.
create policy "Authenticated users read excluded domains" on public.favicons_excluded_domains for select to authenticated
    using (true);
