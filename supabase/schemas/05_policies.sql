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
-- Roles narrow that further (helpers in 02_roles.sql; the assignment rule
-- below is the same as private.can_access_assigned(), written inline so each
-- helper is evaluated once per statement):
-- - org_admin and clinical_lead see every record in their organisation.
-- - key_worker sees only contacts and deals assigned to them (sales_id), and
--   only the notes and tasks attached to those. Child tables check their
--   parent with `exists (select ... from parent)`, which runs under the
--   parent's own policy, so the assignment rule lives in one place.
-- - viewer sees no individual records: only their organisation, its staff
--   list, tags and configuration.
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

-- Companies: organisational records (not people); every role but viewer works with them.
create policy "Case staff in the organisation" on public.companies for all to authenticated
    using (organisation_id = (select private.current_organisation_id()) and (select private.is_case_staff()))
    with check (organisation_id = (select private.current_organisation_id()) and (select private.is_case_staff()));

-- Contacts: key workers read and update only the contacts assigned to them and
-- can't hand them to someone else; creating, deleting and (re)assigning
-- contacts is for org admins and clinical leads.
create policy "Read assigned contacts, or all for leads" on public.contacts for select to authenticated
    using (
        organisation_id = (select private.current_organisation_id())
        and (
            (select private.sees_all_records())
            or ((select private.current_membership_role()) = 'key_worker' and sales_id = (select private.current_sales_id()))
        )
    );
create policy "Update assigned contacts, or all for leads" on public.contacts for update to authenticated
    using (
        organisation_id = (select private.current_organisation_id())
        and (
            (select private.sees_all_records())
            or ((select private.current_membership_role()) = 'key_worker' and sales_id = (select private.current_sales_id()))
        )
    )
    with check (
        organisation_id = (select private.current_organisation_id())
        and (
            (select private.sees_all_records())
            or ((select private.current_membership_role()) = 'key_worker' and sales_id = (select private.current_sales_id()))
        )
    );
create policy "Leads create contacts" on public.contacts for insert to authenticated
    with check (organisation_id = (select private.current_organisation_id()) and (select private.sees_all_records()));
create policy "Leads delete contacts" on public.contacts for delete to authenticated
    using (organisation_id = (select private.current_organisation_id()) and (select private.sees_all_records()));

-- Contact Notes: follow the contact they belong to
create policy "Notes of visible contacts" on public.contact_notes for all to authenticated
    using (
        organisation_id = (select private.current_organisation_id())
        and exists (select 1 from public.contacts c where c.id = contact_id)
    )
    with check (
        organisation_id = (select private.current_organisation_id())
        and exists (select 1 from public.contacts c where c.id = contact_id)
    );

-- Deals: assigned like contacts; key workers can also create and remove their own
create policy "Assigned deals, or all for leads" on public.deals for all to authenticated
    using (
        organisation_id = (select private.current_organisation_id())
        and (
            (select private.sees_all_records())
            or ((select private.current_membership_role()) = 'key_worker' and sales_id = (select private.current_sales_id()))
        )
    )
    with check (
        organisation_id = (select private.current_organisation_id())
        and (
            (select private.sees_all_records())
            or ((select private.current_membership_role()) = 'key_worker' and sales_id = (select private.current_sales_id()))
        )
    );

-- Deal Notes: follow the deal they belong to
create policy "Notes of visible deals" on public.deal_notes for all to authenticated
    using (
        organisation_id = (select private.current_organisation_id())
        and exists (select 1 from public.deals d where d.id = deal_id)
    )
    with check (
        organisation_id = (select private.current_organisation_id())
        and exists (select 1 from public.deals d where d.id = deal_id)
    );

-- Sales (staff profiles): readable within the organisation. Written by the users edge function (service role).
create policy "Tenant isolation" on public.sales for select to authenticated
    using (organisation_id = (select private.current_organisation_id()));

-- Tags: labels, not records about people; everyone reads them, case staff manage them
create policy "Members read tags" on public.tags for select to authenticated
    using (organisation_id = (select private.current_organisation_id()));
create policy "Case staff insert tags" on public.tags for insert to authenticated
    with check (organisation_id = (select private.current_organisation_id()) and (select private.is_case_staff()));
create policy "Case staff update tags" on public.tags for update to authenticated
    using (organisation_id = (select private.current_organisation_id()) and (select private.is_case_staff()))
    with check (organisation_id = (select private.current_organisation_id()) and (select private.is_case_staff()));
create policy "Case staff delete tags" on public.tags for delete to authenticated
    using (organisation_id = (select private.current_organisation_id()) and (select private.is_case_staff()));

-- Tasks: follow the contact they belong to
create policy "Tasks of visible contacts" on public.tasks for all to authenticated
    using (
        organisation_id = (select private.current_organisation_id())
        and exists (select 1 from public.contacts c where c.id = contact_id)
    )
    with check (
        organisation_id = (select private.current_organisation_id())
        and exists (select 1 from public.contacts c where c.id = contact_id)
    );

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
