--
-- Roles
-- Sorts after 01_tables.sql because these helpers read public.sales.
-- memberships.role is the only source of a user's role. The helpers below are
-- what row-level security policies use to apply it:
--   org_admin, clinical_lead  see every record in their organisation
--   key_worker                sees only records assigned to them (sales_id)
--   viewer                    sees no individual records (aggregates only)
--

-- The caller's staff profile id (sales.id), or NULL when they have none.
-- Records are assigned to a key worker through their sales_id column.
create or replace function private.current_sales_id()
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  select s.id
  from public.sales s
  where s.user_id = auth.uid()
$$;

-- True when the caller may see every record in their organisation.
create or replace function private.sees_all_records()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(private.current_membership_role() in ('org_admin', 'clinical_lead'), false)
$$;

-- True for every role that works with individual records (everyone but viewers).
create or replace function private.is_case_staff()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(private.current_membership_role() <> 'viewer', false)
$$;

-- Whether the caller may access a record owned by `record_organisation_id`
-- and assigned to `record_sales_id`. Used by the policies on assignable
-- tables and by functions that must apply the same rule.
create or replace function private.can_access_assigned(record_organisation_id uuid, record_sales_id bigint)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select record_organisation_id = private.current_organisation_id()
    and (
      private.sees_all_records()
      or (private.current_membership_role() = 'key_worker' and record_sales_id = private.current_sales_id())
    )
$$;
