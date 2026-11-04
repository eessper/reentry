--
-- Storage
-- This file declares storage bucket policies.
--
-- The attachments bucket is private (set in the 20261017130000 migration):
-- files are only reachable through short-lived signed URLs, which Storage
-- only issues to callers these policies let read the file.
--
-- Paths are `<organisation_id>/<folder>/<file>`:
-- - `notes/`  note attachments. Org admins and clinical leads read all of
--             them; everyone else only files they uploaded or that are
--             attached to a note they can see (so key workers only get the
--             files of their own service users).
-- - `shared/` staff avatars, company logos and organisation branding,
--             readable by every member of the organisation.
--
-- Only the service role deletes files (see delete_note_attachments).
--

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
