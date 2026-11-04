--
-- Audit log
-- Append-only record of every create, update and delete on tenant tables,
-- plus record views logged through log_record_view(). Rows are written only
-- by the triggers and the function below (SECURITY DEFINER), so nothing the
-- app sends can skip them. App roles can read (within their policy) but never
-- insert, update or delete; a trigger also refuses updates and deletes from
-- the service role.
--

create type public.audit_action as enum ('create', 'update', 'delete', 'view');

create table public.audit_log (
    id bigint generated always as identity primary key,
    organisation_id uuid not null,
    actor_user_id uuid,
    action public.audit_action not null,
    table_name text not null,
    record_id text not null,
    before jsonb,
    after jsonb,
    created_at timestamp with time zone not null default now()
);

-- No foreign keys on purpose: the log must outlive the rows, users and
-- organisations it mentions.
create index audit_log_record_idx on public.audit_log using btree (organisation_id, table_name, record_id, created_at desc);

-- Writes one audit row per changed row. `fts` is a generated search column,
-- left out because it only repeats the other columns.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'fts' end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'fts' end;
  changed_row jsonb := coalesce(new_row, old_row);
begin
  insert into public.audit_log (organisation_id, actor_user_id, action, table_name, record_id, before, after)
  values (
    case when tg_table_name = 'organisations' then changed_row ->> 'id' else changed_row ->> 'organisation_id' end::uuid,
    auth.uid(),
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end::public.audit_action,
    tg_table_name,
    changed_row ->> 'id',
    old_row,
    new_row
  );
  return null;
end;
$$;

create or replace function private.prevent_audit_log_change()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create or replace trigger audit_log_append_only
    before update or delete on public.audit_log
    for each row execute function private.prevent_audit_log_change();

create or replace trigger audit_log_no_truncate
    before truncate on public.audit_log
    for each statement execute function private.prevent_audit_log_change();

create or replace trigger audit_row_change after insert or update or delete on public.organisations
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.memberships
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.sales
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.configuration
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.companies
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.contacts
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.contact_notes
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.tasks
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.deals
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.deal_notes
    for each row execute function private.audit_row_change();
create or replace trigger audit_row_change after insert or update or delete on public.tags
    for each row execute function private.audit_row_change();

-- Records that the caller opened a record. The UI calls it when a record's
-- page is shown. Refuses records the caller can't see, with the same error
-- whether the record is hidden or missing. Only contacts for now; Session 3
-- adds service_users and support_profiles.
create or replace function public.log_record_view(table_name text, record_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  record_organisation_id uuid;
begin
  if log_record_view.table_name <> 'contacts' then
    raise exception 'Views of % are not logged', log_record_view.table_name using errcode = '22023';
  end if;

  select c.organisation_id into record_organisation_id
  from public.contacts c
  where c.id = log_record_view.record_id
    and private.can_access_assigned(c.organisation_id, c.sales_id);

  if record_organisation_id is null then
    raise exception 'Record not found' using errcode = '42501';
  end if;

  insert into public.audit_log (organisation_id, actor_user_id, action, table_name, record_id)
  values (record_organisation_id, auth.uid(), 'view', log_record_view.table_name, log_record_view.record_id::text);
end;
$$;

-- Org admins and clinical leads read their organisation's whole log; key
-- workers read the history of the contacts they can see.
alter table public.audit_log enable row level security;

create policy "Leads read the log, key workers their contacts' history" on public.audit_log for select to authenticated
    using (
        organisation_id = (select private.current_organisation_id())
        and (
            (select private.sees_all_records())
            or (table_name = 'contacts' and exists (select 1 from public.contacts c where c.id::text = record_id))
        )
    );

revoke all on table public.audit_log from anon;
revoke all on table public.audit_log from authenticated;
revoke all on table public.audit_log from service_role;
grant select on table public.audit_log to authenticated;
grant select on table public.audit_log to service_role;

revoke all on function private.audit_row_change() from public;
revoke all on function private.prevent_audit_log_change() from public;

revoke all on function public.log_record_view(text, bigint) from public;
revoke all on function public.log_record_view(text, bigint) from anon;
grant execute on function public.log_record_view(text, bigint) to authenticated;
grant execute on function public.log_record_view(text, bigint) to service_role;
