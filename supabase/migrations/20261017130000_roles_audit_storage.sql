-- Session 2: roles, audit log, private attachments.
--
-- Hand-written, like the tenancy migration, and it must leave the database
-- identical to supabase/schemas/ (check with
-- `npx supabase db diff --local --use-pg-schema`).
--
-- - Enforces membership roles in row-level security: key workers see only
--   the contacts (and deals) assigned to them, viewers see no individual
--   records.
-- - Removes sales.administrator: memberships.role is now the only source of
--   roles. Existing admins already have org_admin (kept in step since the
--   tenancy migration), so no data moves.
-- - Adds the append-only audit_log, written by triggers.
-- - Makes the attachments bucket private with organisation-scoped paths, and
--   moves attachment cleanup to a queue so the edge function no longer
--   deletes whatever paths it is sent.
--
-- Files uploaded before this migration sit at the bucket root. They are not
-- under any organisation's folder, so after it only the service role can
-- reach them. Phase 1 holds synthetic data only.

-- 1. Role helpers ----------------------------------------------------------------

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

-- 2. memberships.role becomes the only source of roles --------------------------

drop trigger if exists on_sale_administrator_changed on public.sales;
drop function if exists public.handle_sale_administrator_changed();
alter table public.sales drop column administrator;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  app_metadata jsonb;
  new_organisation_id uuid;
  new_role public.membership_role;
begin
  -- Runs as a deferred constraint trigger, at commit: Auth inserts the user
  -- first and writes app_metadata in a second statement, so the row is
  -- re-read here instead of trusting NEW.
  select u.raw_app_meta_data into app_metadata
  from auth.users u
  where u.id = new.id;

  -- The organisation comes from app metadata, which only the service role can
  -- set. User metadata is editable by the user and is never trusted for this.
  -- No organisation means the whole sign-up is rolled back: there is no
  -- self-signup into Re-entry.
  new_organisation_id := nullif(app_metadata ->> 'organisation_id', '')::uuid;
  if new_organisation_id is null then
    raise exception 'New users must be created with an organisation in app_metadata.organisation_id'
      using errcode = 'P0001';
  end if;

  new_role := coalesce(nullif(app_metadata ->> 'role', ''), 'key_worker')::public.membership_role;

  insert into public.memberships (organisation_id, user_id, role)
  values (new_organisation_id, new.id, new_role);

  insert into public.sales (first_name, last_name, email, user_id, organisation_id)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    new_organisation_id
  );
  return new;
end;
$$;

-- Staff profiles with their role, which lives only in memberships.
create or replace view public.sales_summary with (security_invoker = on) as
select
    s.id,
    s.first_name,
    s.last_name,
    s.email,
    s.user_id,
    s.avatar,
    s.disabled,
    s.secondary_emails,
    s.organisation_id,
    m.role
from public.sales s
    join public.memberships m on m.user_id = s.user_id;

-- Staff with roles: signed-in users only (RLS limits it to their organisation)
revoke all on table public.sales_summary from anon;
revoke all on table public.sales_summary from authenticated;
grant select on table public.sales_summary to authenticated;
grant select on table public.sales_summary to service_role;

-- 3. Role-aware row-level security ----------------------------------------------

drop policy "Tenant isolation" on public.companies;
drop policy "Tenant isolation" on public.contacts;
drop policy "Tenant isolation" on public.contact_notes;
drop policy "Tenant isolation" on public.deals;
drop policy "Tenant isolation" on public.deal_notes;
drop policy "Tenant isolation" on public.tags;
drop policy "Tenant isolation" on public.tasks;

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

-- A key worker can't delete contacts, so a merge they start would only half
-- apply; merge_contacts now refuses it.
CREATE OR REPLACE FUNCTION "public"."merge_contacts"("loser_id" bigint, "winner_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  winner_contact contacts%ROWTYPE;
  loser_contact contacts%ROWTYPE;
  deal_record RECORD;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_tags bigint[];
  winner_emails jsonb;
  loser_emails jsonb;
  winner_phones jsonb;
  loser_phones jsonb;
  email_map jsonb;
  phone_map jsonb;
BEGIN
  -- Fetch both contacts
  SELECT * INTO winner_contact FROM contacts WHERE id = winner_id;
  SELECT * INTO loser_contact FROM contacts WHERE id = loser_id;

  IF winner_contact IS NULL OR loser_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Reassign tasks from loser to winner
  UPDATE tasks SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 2. Reassign contact notes from loser to winner
  UPDATE contact_notes SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 3. Update deals - replace loser with winner in contact_ids array
  FOR deal_record IN
    SELECT id, contact_ids
    FROM deals
    WHERE contact_ids @> ARRAY[loser_id]
  LOOP
    UPDATE deals
    SET contact_ids = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          array_remove(deal_record.contact_ids, loser_id) || ARRAY[winner_id]
        )
      )
    )
    WHERE id = deal_record.id;
  END LOOP;

  -- 4. Merge contact data

  -- Get email arrays
  winner_emails := COALESCE(winner_contact.email_jsonb, '[]'::jsonb);
  loser_emails := COALESCE(loser_contact.email_jsonb, '[]'::jsonb);

  -- Merge emails with deduplication by email address
  -- Build a map of email -> email object, then convert back to array
  email_map := '{}'::jsonb;

  -- Add winner emails to map
  IF jsonb_array_length(winner_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_emails)-1 LOOP
      email_map := email_map || jsonb_build_object(
        winner_emails->i->>'email',
        winner_emails->i
      );
    END LOOP;
  END IF;

  -- Add loser emails to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_emails)-1 LOOP
      IF NOT email_map ? (loser_emails->i->>'email') THEN
        email_map := email_map || jsonb_build_object(
          loser_emails->i->>'email',
          loser_emails->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_emails := (SELECT jsonb_agg(value) FROM jsonb_each(email_map));
  merged_emails := COALESCE(merged_emails, '[]'::jsonb);

  -- Get phone arrays
  winner_phones := COALESCE(winner_contact.phone_jsonb, '[]'::jsonb);
  loser_phones := COALESCE(loser_contact.phone_jsonb, '[]'::jsonb);

  -- Merge phones with deduplication by number
  phone_map := '{}'::jsonb;

  -- Add winner phones to map
  IF jsonb_array_length(winner_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_phones)-1 LOOP
      phone_map := phone_map || jsonb_build_object(
        winner_phones->i->>'number',
        winner_phones->i
      );
    END LOOP;
  END IF;

  -- Add loser phones to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_phones)-1 LOOP
      IF NOT phone_map ? (loser_phones->i->>'number') THEN
        phone_map := phone_map || jsonb_build_object(
          loser_phones->i->>'number',
          loser_phones->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_phones := (SELECT jsonb_agg(value) FROM jsonb_each(phone_map));
  merged_phones := COALESCE(merged_phones, '[]'::jsonb);

  -- Merge tags (remove duplicates)
  merged_tags := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(winner_contact.tags, ARRAY[]::bigint[]) ||
      COALESCE(loser_contact.tags, ARRAY[]::bigint[])
    )
  );

  -- 5. Update winner with merged data
  UPDATE contacts SET
    avatar = COALESCE(winner_contact.avatar, loser_contact.avatar),
    gender = COALESCE(winner_contact.gender, loser_contact.gender),
    first_name = COALESCE(winner_contact.first_name, loser_contact.first_name),
    last_name = COALESCE(winner_contact.last_name, loser_contact.last_name),
    title = COALESCE(winner_contact.title, loser_contact.title),
    company_id = COALESCE(winner_contact.company_id, loser_contact.company_id),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones,
    linkedin_url = COALESCE(winner_contact.linkedin_url, loser_contact.linkedin_url),
    background = COALESCE(winner_contact.background, loser_contact.background),
    has_newsletter = COALESCE(winner_contact.has_newsletter, loser_contact.has_newsletter),
    first_seen = LEAST(COALESCE(winner_contact.first_seen, loser_contact.first_seen), COALESCE(loser_contact.first_seen, winner_contact.first_seen)),
    last_seen = GREATEST(COALESCE(winner_contact.last_seen, loser_contact.last_seen), COALESCE(loser_contact.last_seen, winner_contact.last_seen)),
    sales_id = COALESCE(winner_contact.sales_id, loser_contact.sales_id),
    tags = merged_tags
  WHERE id = winner_id;

  -- 6. Delete loser contact
  DELETE FROM contacts WHERE id = loser_id;

  -- Row-level security only lets org admins and clinical leads delete
  -- contacts; anyone else would get a half-applied merge, so undo it all.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed to merge contacts' USING ERRCODE = '42501';
  END IF;

  RETURN winner_id;
END;
$$;

-- 4. Private attachments ---------------------------------------------------------

update storage.buckets set public = false where id = 'attachments';

drop policy if exists "Attachments 1mt4rzk_0" on storage.objects;
drop policy if exists "Attachments 1mt4rzk_1" on storage.objects;
drop policy if exists "Attachments 1mt4rzk_3" on storage.objects;

create policy "Attachments: members upload into their organisation" on storage.objects for insert to authenticated
    with check (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = (select private.current_organisation_id())::text
        and (
            (storage.foldername(name))[2] = 'shared'
            or ((storage.foldername(name))[2] = 'notes' and (select private.is_case_staff()))
        )
    );

create policy "Attachments: members read what they may see" on storage.objects for select to authenticated
    using (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = (select private.current_organisation_id())::text
        and (
            (storage.foldername(name))[2] = 'shared'
            or (
                (storage.foldername(name))[2] = 'notes'
                and (
                    (select private.sees_all_records())
                    or ((select private.is_case_staff()) and owner_id = (select auth.uid())::text)
                    or exists (
                        select 1 from public.contact_notes n, unnest(n.attachments) as a
                        where a ->> 'path' = objects.name
                    )
                    or exists (
                        select 1 from public.deal_notes n, unnest(n.attachments) as a
                        where a ->> 'path' = objects.name
                    )
                )
            )
        )
    );

-- Files orphaned by note edits and deletes, waiting for the
-- delete_note_attachments edge function (service role) to remove them.
-- Filled only by the cleanup_note_attachments trigger.
create table public.storage_deletion_queue (
    path text primary key,
    organisation_id uuid not null,
    queued_at timestamp with time zone not null default now()
);

alter table public.storage_deletion_queue enable row level security;

revoke all on table public.storage_deletion_queue from anon;
revoke all on table public.storage_deletion_queue from authenticated;
revoke all on table public.storage_deletion_queue from service_role;
grant select, delete on table public.storage_deletion_queue to service_role;

CREATE OR REPLACE FUNCTION "public"."cleanup_note_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    DECLARE
      queued integer;
      request_headers jsonb;
      auth_header text;
    BEGIN
      -- Queue the files this change orphaned. Only paths inside the note's own
      -- organisation folder qualify, and only when no other note still uses
      -- them, so a crafted attachments array can't get anyone else's file
      -- deleted. The delete_note_attachments edge function drains the queue;
      -- it never takes paths from the request.
      INSERT INTO public.storage_deletion_queue (path, organisation_id)
      SELECT DISTINCT removed.path, OLD.organisation_id
      FROM unnest(OLD.attachments) AS old_attachment
        CROSS JOIN LATERAL (SELECT old_attachment ->> 'path' AS path) AS removed
      WHERE removed.path LIKE OLD.organisation_id::text || '/notes/%'
        AND (
          TG_OP = 'DELETE'
          OR NOT EXISTS (
            SELECT 1 FROM unnest(NEW.attachments) AS new_attachment
            WHERE new_attachment ->> 'path' = removed.path
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.contact_notes n, unnest(n.attachments) AS a
          WHERE a ->> 'path' = removed.path
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.deal_notes n, unnest(n.attachments) AS a
          WHERE a ->> 'path' = removed.path
        )
      ON CONFLICT (path) DO NOTHING;
      GET DIAGNOSTICS queued = ROW_COUNT;

      request_headers := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb,
        '{}'::jsonb
      );
      auth_header := request_headers ->> 'authorization';

      -- Wake the edge function up. Without a caller token (SQL, service role)
      -- the files stay queued until the next wake-up.
      IF queued > 0 AND auth_header IS NOT NULL AND auth_header <> '' THEN
        PERFORM net.http_post(
          url := public.get_note_attachments_function_url(),
          body := '{}'::jsonb,
          params := '{}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type',
            'application/json',
            'Authorization',
            auth_header
          ),
          timeout_milliseconds := 10000
        );
      END IF;

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $$;

-- 5. Audit log -------------------------------------------------------------------

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
