--
-- Storage
-- This file declares storage bucket policies.
--
-- The attachments bucket is private (set in the 20261017130000 migration):
-- files are only reachable through short-lived signed URLs, which Storage
-- only issues to callers these policies let read the file.
--
-- Paths are `<organisation_id>/shared/<file>`: staff avatars and
-- organisation branding, readable by every member of the organisation.
-- Nothing about the people Re-entry supports is stored as a file.
-- Only the service role deletes files.
--

create policy "Attachments: members upload into their organisation" on storage.objects for insert to authenticated
    with check (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = (select private.current_organisation_id())::text
        and (storage.foldername(name))[2] = 'shared'
    );

create policy "Attachments: members read what they may see" on storage.objects for select to authenticated
    using (
        bucket_id = 'attachments'
        and (storage.foldername(name))[1] = (select private.current_organisation_id())::text
        and (storage.foldername(name))[2] = 'shared'
    );
