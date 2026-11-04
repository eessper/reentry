-- Attachment storage tests.
--
-- The attachments bucket is private and organised as
-- `<organisation_id>/notes/...` (note attachments) and
-- `<organisation_id>/shared/...` (avatars, logos). Storage only signs URLs
-- for files the caller can select, so these policies decide who can download
-- what. Also covers the deletion queue that replaced the old "delete any
-- path you send" behaviour of the delete_note_attachments function.
--
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

set constraints all immediate;

-------------------------------------------------------------------------------
-- Fixtures (as the database owner)
-------------------------------------------------------------------------------

insert into public.organisations (id, name) values
    ('a0000000-0000-0000-0000-000000000000', 'Alpha'),
    ('b0000000-0000-0000-0000-000000000000', 'Bravo');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
       jsonb_build_object('first_name', first_name, 'last_name', 'Test'),
       jsonb_build_object('organisation_id', organisation_id, 'role', role),
       now(), now()
from (values
    ('a0000000-0000-0000-0000-0000000000a1', 'alice@alpha.test', 'Alice', 'a0000000-0000-0000-0000-000000000000', 'org_admin'),
    ('a0000000-0000-0000-0000-0000000000e1', 'kim@alpha.test', 'Kim', 'a0000000-0000-0000-0000-000000000000', 'key_worker'),
    ('a0000000-0000-0000-0000-0000000000e2', 'ken@alpha.test', 'Ken', 'a0000000-0000-0000-0000-000000000000', 'key_worker'),
    ('a0000000-0000-0000-0000-0000000000f1', 'vera@alpha.test', 'Vera', 'a0000000-0000-0000-0000-000000000000', 'viewer'),
    ('b0000000-0000-0000-0000-0000000000b1', 'bob@bravo.test', 'Bob', 'b0000000-0000-0000-0000-000000000000', 'org_admin')
) as u(id, email, first_name, organisation_id, role);

insert into public.contacts (id, first_name, organisation_id, sales_id) values
    (9001, 'Kims client', 'a0000000-0000-0000-0000-000000000000', (select id from public.sales where email = 'kim@alpha.test')),
    (9002, 'Kens client', 'a0000000-0000-0000-0000-000000000000', (select id from public.sales where email = 'ken@alpha.test'));

insert into public.contact_notes (id, contact_id, text, organisation_id, attachments) values
    (9001, 9001, 'Kim client note', 'a0000000-0000-0000-0000-000000000000',
     array['{"path": "a0000000-0000-0000-0000-000000000000/notes/kim-client.pdf", "title": "kim-client.pdf"}'::jsonb]),
    (9002, 9002, 'Ken client note', 'a0000000-0000-0000-0000-000000000000',
     array['{"path": "a0000000-0000-0000-0000-000000000000/notes/ken-client.pdf", "title": "ken-client.pdf"}'::jsonb]);

insert into storage.objects (bucket_id, name, owner_id) values
    ('attachments', 'a0000000-0000-0000-0000-000000000000/notes/kim-client.pdf', 'a0000000-0000-0000-0000-0000000000a1'),
    ('attachments', 'a0000000-0000-0000-0000-000000000000/notes/ken-client.pdf', 'a0000000-0000-0000-0000-0000000000e2'),
    ('attachments', 'a0000000-0000-0000-0000-000000000000/shared/logo.png', 'a0000000-0000-0000-0000-0000000000a1'),
    ('attachments', 'b0000000-0000-0000-0000-000000000000/notes/bravo.pdf', 'b0000000-0000-0000-0000-0000000000b1'),
    ('attachments', 'b0000000-0000-0000-0000-000000000000/shared/bravo-logo.png', 'b0000000-0000-0000-0000-0000000000b1'),
    ('attachments', '0.123456.png', null);

create function pg_temp.sign_in(user_id text)
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.visible(object_name text)
returns boolean
language sql
as $$ select exists (select 1 from storage.objects where bucket_id = 'attachments' and name = object_name) $$;

-------------------------------------------------------------------------------
-- The bucket
-------------------------------------------------------------------------------

select is((select public from storage.buckets where id = 'attachments'), false,
    'the attachments bucket is private: files are only reachable through signed URLs');

reset role;
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'attachments'), 0::bigint,
    'anon: cannot see any attachment');

-------------------------------------------------------------------------------
-- Key worker (Kim)
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');

select ok(pg_temp.visible('a0000000-0000-0000-0000-000000000000/notes/kim-client.pdf'),
    'key worker: can read a file attached to a note on their contact, whoever uploaded it');
select ok(not pg_temp.visible('a0000000-0000-0000-0000-000000000000/notes/ken-client.pdf'),
    'key worker: cannot read a file attached to someone else''s contact');
select ok(pg_temp.visible('a0000000-0000-0000-0000-000000000000/shared/logo.png'),
    'key worker: can read shared organisation files (logos, avatars)');
select is((select count(*) from storage.objects where name like 'b0000000-%'), 0::bigint,
    'key worker: cannot read any file of another organisation');
select ok(not pg_temp.visible('0.123456.png'),
    'key worker: cannot read files outside any organisation folder (pre-Session 2 uploads)');

select lives_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'a0000000-0000-0000-0000-000000000000/notes/kim-upload.pdf', 'a0000000-0000-0000-0000-0000000000e1')$$,
    'key worker: can upload a note attachment into their organisation''s folder');
select ok(pg_temp.visible('a0000000-0000-0000-0000-000000000000/notes/kim-upload.pdf'),
    'key worker: can read their own upload before it is attached to a note');
select throws_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'b0000000-0000-0000-0000-000000000000/notes/sneaky.pdf', 'a0000000-0000-0000-0000-0000000000e1')$$,
    '42501', null, 'key worker: cannot upload into another organisation''s folder');
select throws_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'sneaky.pdf', 'a0000000-0000-0000-0000-0000000000e1')$$,
    '42501', null, 'key worker: cannot upload outside an organisation folder');
select throws_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'a0000000-0000-0000-0000-000000000000/other/sneaky.pdf', 'a0000000-0000-0000-0000-0000000000e1')$$,
    '42501', null, 'key worker: cannot upload into an unknown folder');

set local storage.allow_delete_query = 'true';
with removed as (
    delete from storage.objects where name = 'a0000000-0000-0000-0000-000000000000/notes/kim-client.pdf' returning 1
)
select is((select count(*) from removed), 0::bigint, 'key worker: cannot delete files directly');
with changed as (
    update storage.objects set name = name || '.moved' where name = 'a0000000-0000-0000-0000-000000000000/notes/kim-upload.pdf' returning 1
)
select is((select count(*) from changed), 0::bigint, 'key worker: cannot rename or overwrite files');

-------------------------------------------------------------------------------
-- Second key worker (Ken)
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e2');

select ok(not pg_temp.visible('a0000000-0000-0000-0000-000000000000/notes/kim-upload.pdf'),
    'second key worker: cannot read a colleague''s unattached upload');
select ok(pg_temp.visible('a0000000-0000-0000-0000-000000000000/notes/ken-client.pdf'),
    'second key worker: can read files on their own contact');

-------------------------------------------------------------------------------
-- Viewer (Vera)
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000f1');

select is((select count(*) from storage.objects where name like 'a0000000-0000-0000-0000-000000000000/notes/%'), 0::bigint,
    'viewer: cannot read any note attachment');
select ok(pg_temp.visible('a0000000-0000-0000-0000-000000000000/shared/logo.png'),
    'viewer: can read shared organisation files');
select throws_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'a0000000-0000-0000-0000-000000000000/notes/viewer.pdf', 'a0000000-0000-0000-0000-0000000000f1')$$,
    '42501', null, 'viewer: cannot upload note attachments');
select lives_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'a0000000-0000-0000-0000-000000000000/shared/vera-avatar.png', 'a0000000-0000-0000-0000-0000000000f1')$$,
    'viewer: can upload a shared file such as their avatar');

-------------------------------------------------------------------------------
-- Org admin (Alice) and another organisation's admin (Bob)
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');
select is((select count(*) from storage.objects where name like 'a0000000-0000-0000-0000-000000000000/notes/%'), 3::bigint,
    'org admin: can read every note attachment in their organisation');

select pg_temp.sign_in('b0000000-0000-0000-0000-0000000000b1');
select is((select count(*) from storage.objects where name like 'a0000000-%'), 0::bigint,
    'another organisation''s admin: cannot read any Alpha file');

-------------------------------------------------------------------------------
-- Deletion queue: only files really orphaned inside the note's organisation
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');

update public.contact_notes set attachments = '{}' where id = 9001;
reset role;
select ok(exists (select 1 from public.storage_deletion_queue where path = 'a0000000-0000-0000-0000-000000000000/notes/kim-client.pdf'),
    'removing an attachment from a note queues its file for deletion');

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');
insert into public.contact_notes (id, contact_id, text, attachments) values
    (9010, 9001, 'Points at Bravo', array['{"path": "b0000000-0000-0000-0000-000000000000/notes/bravo.pdf"}'::jsonb]),
    (9011, 9001, 'Points at Ken''s file', array['{"path": "a0000000-0000-0000-0000-000000000000/notes/ken-client.pdf"}'::jsonb]),
    (9012, 9001, 'Shares a file', array['{"path": "a0000000-0000-0000-0000-000000000000/notes/shared-use.pdf"}'::jsonb]),
    (9013, 9001, 'Shares a file too', array['{"path": "a0000000-0000-0000-0000-000000000000/notes/shared-use.pdf"}'::jsonb]),
    (9014, 9001, 'Points at a shared logo', array['{"path": "a0000000-0000-0000-0000-000000000000/shared/logo.png"}'::jsonb]);
delete from public.contact_notes where id in (9010, 9011, 9012, 9014);

reset role;
select ok(not exists (select 1 from public.storage_deletion_queue where path like 'b0000000-%'),
    'a note pointing at another organisation''s file never gets that file deleted');
select ok(not exists (select 1 from public.storage_deletion_queue where path like '%/notes/ken-client.pdf'),
    'a file still attached to another note is not deleted');
select ok(not exists (select 1 from public.storage_deletion_queue where path like '%/shared/logo.png'),
    'note cleanup never deletes shared files');
select ok(not exists (select 1 from public.storage_deletion_queue where path like '%/notes/shared-use.pdf'),
    'a file shared by two notes stays while one of them still uses it');

delete from public.contact_notes where id = 9013;
select ok(exists (select 1 from public.storage_deletion_queue where path like '%/notes/shared-use.pdf'),
    'the file is queued once the last note using it is deleted');

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');
select throws_ok($$select count(*) from public.storage_deletion_queue$$, '42501', null,
    'authenticated: cannot read the deletion queue');
select throws_ok($$insert into public.storage_deletion_queue (path, organisation_id)
      values ('a0000000-0000-0000-0000-000000000000/notes/ken-client.pdf', 'a0000000-0000-0000-0000-000000000000')$$,
    '42501', null, 'authenticated: cannot queue files for deletion');

reset role;
set local role service_role;
select ok((select count(*) from public.storage_deletion_queue) >= 2, 'service_role: can read the deletion queue');

select * from finish();
rollback;
