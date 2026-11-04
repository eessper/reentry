-- Tenancy isolation tests.
--
-- Sets up two organisations, Alpha and Bravo, each with users and a row in
-- every tenant table, then signs in as Alpha's users and proves they can't
-- read, change, delete or link to anything belonging to Bravo.
--
-- Users are impersonated exactly as API requests arrive: `role authenticated`
-- plus a JWT `sub` claim. Everything runs in a transaction that is rolled back.
--
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(72);

-- Deferred triggers (handle_new_user) fire at the end of each statement
-- instead of at commit, which this transaction never reaches.
set constraints all immediate;

-------------------------------------------------------------------------------
-- Fixtures (as the database owner, bypassing RLS)
-------------------------------------------------------------------------------

insert into public.organisations (id, name) values
    ('a0000000-0000-0000-0000-000000000000', 'Alpha'),
    ('b0000000-0000-0000-0000-000000000000', 'Bravo');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at) values
    ('a0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@alpha.test',
     '{"first_name": "Alice", "last_name": "Admin"}',
     '{"organisation_id": "a0000000-0000-0000-0000-000000000000", "role": "org_admin"}', now(), now()),
    ('a0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aaron@alpha.test',
     '{"first_name": "Aaron", "last_name": "Worker"}',
     '{"organisation_id": "a0000000-0000-0000-0000-000000000000"}', now(), now()),
    ('b0000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@bravo.test',
     '{"first_name": "Bob", "last_name": "Admin"}',
     '{"organisation_id": "b0000000-0000-0000-0000-000000000000", "role": "org_admin"}', now(), now());

create temporary table ids on commit drop as
select
    (select id from public.sales where email = 'alice@alpha.test') as alice_sales_id,
    (select id from public.sales where email = 'aaron@alpha.test') as aaron_sales_id,
    (select id from public.sales where email = 'bob@bravo.test') as bob_sales_id;
grant select on ids to authenticated;

insert into public.companies (id, name, organisation_id, sales_id) values
    (9001, 'Alpha Housing Trust', 'a0000000-0000-0000-0000-000000000000', (select alice_sales_id from ids)),
    (9101, 'Bravo Housing Trust', 'b0000000-0000-0000-0000-000000000000', (select bob_sales_id from ids));

insert into public.contacts (id, first_name, last_name, organisation_id, company_id, sales_id) values
    (9001, 'Alpha', 'Person', 'a0000000-0000-0000-0000-000000000000', 9001, (select alice_sales_id from ids)),
    (9101, 'Bravo', 'Person', 'b0000000-0000-0000-0000-000000000000', 9101, (select bob_sales_id from ids));

insert into public.contact_notes (id, contact_id, text, organisation_id, sales_id) values
    (9001, 9001, 'Alpha note', 'a0000000-0000-0000-0000-000000000000', (select alice_sales_id from ids)),
    (9101, 9101, 'Bravo note', 'b0000000-0000-0000-0000-000000000000', (select bob_sales_id from ids));

insert into public.deals (id, name, stage, organisation_id, company_id, sales_id) values
    (9001, 'Alpha deal', 'opportunity', 'a0000000-0000-0000-0000-000000000000', 9001, (select alice_sales_id from ids)),
    (9101, 'Bravo deal', 'opportunity', 'b0000000-0000-0000-0000-000000000000', 9101, (select bob_sales_id from ids));

insert into public.deal_notes (id, deal_id, text, organisation_id, sales_id) values
    (9001, 9001, 'Alpha deal note', 'a0000000-0000-0000-0000-000000000000', (select alice_sales_id from ids)),
    (9101, 9101, 'Bravo deal note', 'b0000000-0000-0000-0000-000000000000', (select bob_sales_id from ids));

insert into public.tags (id, name, color, organisation_id) values
    (9001, 'alpha-tag', '#eeeeee', 'a0000000-0000-0000-0000-000000000000'),
    (9101, 'bravo-tag', '#eeeeee', 'b0000000-0000-0000-0000-000000000000');

insert into public.tasks (id, contact_id, text, organisation_id, sales_id) values
    (9001, 9001, 'Alpha task', 'a0000000-0000-0000-0000-000000000000', (select alice_sales_id from ids)),
    (9101, 9101, 'Bravo task', 'b0000000-0000-0000-0000-000000000000', (select bob_sales_id from ids));

update public.configuration set config = '{"title": "Bravo"}' where organisation_id = 'b0000000-0000-0000-0000-000000000000';

-- Runs the same five checks against one tenant table as the signed-in user.
-- `insert_into_bravo` is an INSERT that targets Bravo's organisation explicitly.
create function pg_temp.check_isolation(tbl text, insert_into_bravo text)
returns setof text
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I where organisation_id = %L', tbl, 'a0000000-0000-0000-0000-000000000000') into n;
  return next ok(n > 0, tbl || ': Alpha user sees their own organisation''s rows');

  execute format('select count(*) from public.%I where organisation_id = %L', tbl, 'b0000000-0000-0000-0000-000000000000') into n;
  return next is(n, 0::bigint, tbl || ': Alpha user cannot read Bravo rows');

  execute format(
    'with changed as (update public.%I set organisation_id = organisation_id where organisation_id = %L returning 1) select count(*) from changed',
    tbl, 'b0000000-0000-0000-0000-000000000000') into n;
  return next is(n, 0::bigint, tbl || ': Alpha user cannot update Bravo rows');

  execute format(
    'with removed as (delete from public.%I where organisation_id = %L returning 1) select count(*) from removed',
    tbl, 'b0000000-0000-0000-0000-000000000000') into n;
  return next is(n, 0::bigint, tbl || ': Alpha user cannot delete Bravo rows');

  return next throws_ok(insert_into_bravo, '42501', null, tbl || ': Alpha user cannot insert rows into Bravo');
end;
$$;

-------------------------------------------------------------------------------
-- Signed in as Alice (Alpha org_admin)
-------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
set local role authenticated;

-- Every tenant table: read, update, delete and insert across the boundary (5 checks each)
select * from pg_temp.check_isolation('companies',
    $$insert into public.companies (name, organisation_id) values ('Sneaky', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('contacts',
    $$insert into public.contacts (first_name, organisation_id) values ('Sneaky', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('contact_notes',
    $$insert into public.contact_notes (contact_id, text, organisation_id) values (9101, 'Sneaky', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('deals',
    $$insert into public.deals (name, stage, organisation_id) values ('Sneaky', 'opportunity', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('deal_notes',
    $$insert into public.deal_notes (deal_id, text, organisation_id) values (9101, 'Sneaky', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('tags',
    $$insert into public.tags (name, color, organisation_id) values ('Sneaky', '#000000', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('tasks',
    $$insert into public.tasks (contact_id, text, organisation_id) values (9101, 'Sneaky', 'b0000000-0000-0000-0000-000000000000')$$);
select * from pg_temp.check_isolation('sales',
    $$insert into public.sales (first_name, last_name, email, administrator, user_id, organisation_id)
      values ('Sneaky', 'User', 'sneaky@bravo.test', true, 'a0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000000')$$);

-- Moving one of your own rows into another organisation
select throws_ok(
    $$update public.contacts set organisation_id = 'b0000000-0000-0000-0000-000000000000' where id = 9001$$,
    '42501', null,
    'contacts: Alpha user cannot move their own row into Bravo');

-- New rows are stamped with the caller's organisation automatically
insert into public.tags (name, color) values ('stamped', '#123456');
select is(
    (select organisation_id from public.tags where name = 'stamped'),
    'a0000000-0000-0000-0000-000000000000'::uuid,
    'tags: rows inserted without an organisation get the caller''s organisation');

-- Links across organisations are refused by the composite foreign keys
select throws_ok(
    $$insert into public.contacts (first_name, company_id) values ('Linked', 9101)$$,
    '23503', null,
    'contacts: cannot attach a contact to a Bravo company');
select throws_ok(
    $$insert into public.contact_notes (contact_id, text) values (9101, 'Linked')$$,
    '23503', null,
    'contact_notes: cannot attach a note to a Bravo contact');
select throws_ok(
    $$insert into public.tasks (contact_id, text) values (9101, 'Linked')$$,
    '23503', null,
    'tasks: cannot attach a task to a Bravo contact');
select throws_ok(
    $$insert into public.deals (name, stage, company_id) values ('Linked', 'opportunity', 9101)$$,
    '23503', null,
    'deals: cannot attach a deal to a Bravo company');
select throws_ok(
    $$insert into public.deal_notes (deal_id, text) values (9101, 'Linked')$$,
    '23503', null,
    'deal_notes: cannot attach a note to a Bravo deal');
select throws_ok(
    format('update public.contacts set sales_id = %s where id = 9001', (select bob_sales_id from ids)),
    '23503', null,
    'contacts: cannot assign a Bravo staff member to an Alpha contact');

-- Views and search only return the caller's organisation
select is(
    (select count(*) from public.contacts_summary where id = 9101), 0::bigint,
    'contacts_summary: Alpha user cannot see Bravo contacts');
select is(
    (select count(*) from public.companies_summary where id = 9101), 0::bigint,
    'companies_summary: Alpha user cannot see Bravo companies');
select is(
    (select count(*) from public.activity_log where id like '%.9101.%'), 0::bigint,
    'activity_log: Alpha user cannot see Bravo activity');
select is(
    (select count(*) from public.global_search('Bravo')), 0::bigint,
    'global_search: Alpha user cannot find Bravo records');
select ok(
    (select count(*) from public.global_search('Alpha')) > 0,
    'global_search: Alpha user finds their own records');

-- Organisations and memberships
select results_eq(
    $$select name from public.organisations$$,
    $$values ('Alpha')$$,
    'organisations: Alpha user sees only their own organisation');
select is(
    (select count(*) from public.memberships where organisation_id = 'b0000000-0000-0000-0000-000000000000'), 0::bigint,
    'memberships: Alpha user cannot see Bravo memberships');
select is(
    (select count(*) from public.memberships), 2::bigint,
    'memberships: Alpha user sees their own organisation''s memberships');
select throws_ok(
    $$insert into public.memberships (organisation_id, user_id, role)
      values ('b0000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-0000000000a1', 'org_admin')$$,
    '42501', null,
    'memberships: users cannot add themselves to another organisation');
select throws_ok(
    $$update public.memberships set role = 'org_admin' where user_id = 'a0000000-0000-0000-0000-0000000000a2'$$,
    '42501', null,
    'memberships: users cannot change roles directly');
select throws_ok(
    $$insert into public.organisations (name) values ('Rogue organisation')$$,
    '42501', null,
    'organisations: users cannot create organisations');

-- Configuration: the frontend asks for id = 1 and must get its own organisation's row
select results_eq(
    $$select organisation_id from public.configuration where id = 1$$,
    $$values ('a0000000-0000-0000-0000-000000000000'::uuid)$$,
    'configuration: id = 1 resolves to the caller''s own organisation');
update public.configuration set config = '{"title": "Alpha"}' where id = 1;
select is(
    (select config ->> 'title' from public.configuration where id = 1), 'Alpha',
    'configuration: an organisation admin can update their own configuration');

select ok(public.is_admin(), 'is_admin: true for an org_admin');

-------------------------------------------------------------------------------
-- Signed in as Aaron (Alpha key_worker, not an admin)
-------------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub": "a0000000-0000-0000-0000-0000000000a2", "role": "authenticated"}', true);
set local role authenticated;

select ok(not public.is_admin(), 'is_admin: false for a key_worker');
with changed as (
    update public.configuration set config = '{"title": "Hijacked"}' where id = 1 returning 1
)
select is(
    (select count(*) from changed),
    0::bigint,
    'configuration: a non-admin cannot update the configuration');

-------------------------------------------------------------------------------
-- Signed in as someone with no membership
-------------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub": "c0000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;

select is(
    (select count(*) from public.companies) + (select count(*) from public.contacts)
      + (select count(*) from public.contact_notes) + (select count(*) from public.deals)
      + (select count(*) from public.deal_notes) + (select count(*) from public.tags)
      + (select count(*) from public.tasks) + (select count(*) from public.sales)
      + (select count(*) from public.configuration) + (select count(*) from public.organisations)
      + (select count(*) from public.memberships),
    0::bigint,
    'no membership: sees no rows in any tenant table');
select throws_ok(
    $$insert into public.companies (name) values ('Orphan')$$,
    '42501', null,
    'no membership: cannot create rows');

-------------------------------------------------------------------------------
-- Back as the database owner: Bravo's data is untouched
-------------------------------------------------------------------------------

reset role;

select is(
    (select count(*) from public.companies where organisation_id = 'b0000000-0000-0000-0000-000000000000'), 1::bigint,
    'Bravo still has exactly its one company');
select is(
    (select config ->> 'title' from public.configuration where organisation_id = 'b0000000-0000-0000-0000-000000000000'), 'Bravo',
    'Bravo configuration is unchanged');
select is(
    (select config ->> 'title' from public.configuration where organisation_id = 'a0000000-0000-0000-0000-000000000000'), 'Alpha',
    'Alpha configuration kept the admin''s change and not the key worker''s');

-------------------------------------------------------------------------------
-- Account creation
-------------------------------------------------------------------------------

select results_eq(
    $$select m.role::text, s.administrator, s.organisation_id
      from public.memberships m join public.sales s on s.user_id = m.user_id
      where m.user_id = 'a0000000-0000-0000-0000-0000000000a2'$$,
    $$values ('key_worker', false, 'a0000000-0000-0000-0000-000000000000'::uuid)$$,
    'new user: membership and staff profile created in the organisation from app_metadata, defaulting to key_worker');

select throws_ok(
    $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
      values ('c0000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'stranger@example.test', '{"organisation_id": "a0000000-0000-0000-0000-000000000000"}', '{"provider": "email"}', now(), now())$$,
    'P0001', null,
    'self-signup: a user without an organisation in app_metadata is refused, even with one forged in user metadata');

update public.sales set administrator = true where email = 'aaron@alpha.test';
select is(
    (select role::text from public.memberships where user_id = 'a0000000-0000-0000-0000-0000000000a2'), 'org_admin',
    'admin flag: making a staff member administrator promotes their membership to org_admin');

select * from finish();
rollback;
