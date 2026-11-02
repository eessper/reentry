-- Attachment storage tests.
--
-- The attachments bucket is private and holds only organisation-shared files
-- (`<organisation_id>/shared/...`: avatars, branding). Storage only signs URLs
-- for files the caller can select, so these policies decide who can download
-- what. Nothing about the people Re-entry supports is stored as a file.
--
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

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

insert into storage.objects (bucket_id, name, owner_id) values
    ('attachments', 'a0000000-0000-0000-0000-000000000000/shared/logo.png', 'a0000000-0000-0000-0000-0000000000a1'),
    ('attachments', 'a0000000-0000-0000-0000-000000000000/notes/old-note.pdf', 'a0000000-0000-0000-0000-0000000000a1'),
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

select ok(pg_temp.visible('a0000000-0000-0000-0000-000000000000/shared/logo.png'),
    'key worker: can read shared organisation files (logos, avatars)');
select is((select count(*) from storage.objects where name like 'b0000000-%'), 0::bigint,
    'key worker: cannot read any file of another organisation');
select ok(not pg_temp.visible('0.123456.png'),
    'key worker: cannot read files outside any organisation folder (pre-Session 2 uploads)');
select ok(not pg_temp.visible('a0000000-0000-0000-0000-000000000000/notes/old-note.pdf'),
    'key worker: cannot read files left in the retired notes folder');

select lives_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'a0000000-0000-0000-0000-000000000000/shared/kim-avatar.png', 'a0000000-0000-0000-0000-0000000000e1')$$,
    'key worker: can upload a shared file such as their avatar');
select throws_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'a0000000-0000-0000-0000-000000000000/notes/kim-upload.pdf', 'a0000000-0000-0000-0000-0000000000e1')$$,
    '42501', null, 'key worker: cannot upload into the retired notes folder');
select throws_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'b0000000-0000-0000-0000-000000000000/shared/sneaky.png', 'a0000000-0000-0000-0000-0000000000e1')$$,
    '42501', null, 'key worker: cannot upload into another organisation''s folder');
select throws_ok(
    $$insert into storage.objects (bucket_id, name, owner_id)
      values ('attachments', 'sneaky.png', 'a0000000-0000-0000-0000-0000000000e1')$$,
    '42501', null, 'key worker: cannot upload outside an organisation folder');

set local storage.allow_delete_query = 'true';
with removed as (
    delete from storage.objects where name = 'a0000000-0000-0000-0000-000000000000/shared/logo.png' returning 1
)
select is((select count(*) from removed), 0::bigint, 'key worker: cannot delete files directly');
with changed as (
    update storage.objects set name = name || '.moved' where name = 'a0000000-0000-0000-0000-000000000000/shared/kim-avatar.png' returning 1
)
select is((select count(*) from changed), 0::bigint, 'key worker: cannot rename or overwrite files');

-------------------------------------------------------------------------------
-- Viewer (Vera), org admin (Alice) and another organisation's admin (Bob)
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000f1');
select ok(pg_temp.visible('a0000000-0000-0000-0000-000000000000/shared/logo.png'),
    'viewer: can read shared organisation files');

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');
select is((select count(*) from storage.objects where name like 'a0000000-0000-0000-0000-000000000000/notes/%'), 0::bigint,
    'org admin: cannot read files left in the retired notes folder either');

select pg_temp.sign_in('b0000000-0000-0000-0000-0000000000b1');
select is((select count(*) from storage.objects where name like 'a0000000-%'), 0::bigint,
    'another organisation''s admin: cannot read any Alpha file');

select * from finish();
rollback;
