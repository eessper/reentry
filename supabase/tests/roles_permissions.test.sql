-- Role permission tests.
--
-- One organisation, Alpha, with one member per role plus a second key
-- worker, and records assigned to each key worker. Signs in as each role and
-- proves what it can and can't see and change:
--
--   org_admin, clinical_lead  every record in the organisation
--   key_worker                only the records assigned to them
--   viewer                    no individual records
--
-- Users are impersonated exactly as API requests arrive: `role authenticated`
-- plus a JWT `sub` claim. Everything runs in a transaction that is rolled back.
--
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(71);

-- Deferred triggers (handle_new_user) fire at the end of each statement
-- instead of at commit, which this transaction never reaches.
set constraints all immediate;

-------------------------------------------------------------------------------
-- Fixtures (as the database owner, bypassing RLS)
-------------------------------------------------------------------------------

insert into public.organisations (id, name) values
    ('a0000000-0000-0000-0000-000000000000', 'Alpha');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
       jsonb_build_object('first_name', first_name, 'last_name', 'Test'),
       jsonb_build_object('organisation_id', 'a0000000-0000-0000-0000-000000000000', 'role', role),
       now(), now()
from (values
    ('a0000000-0000-0000-0000-0000000000a1', 'alice@alpha.test', 'Alice', 'org_admin'),
    ('a0000000-0000-0000-0000-0000000000c1', 'carla@alpha.test', 'Carla', 'clinical_lead'),
    ('a0000000-0000-0000-0000-0000000000e1', 'kim@alpha.test', 'Kim', 'key_worker'),
    ('a0000000-0000-0000-0000-0000000000e2', 'ken@alpha.test', 'Ken', 'key_worker'),
    ('a0000000-0000-0000-0000-0000000000f1', 'vera@alpha.test', 'Vera', 'viewer')
) as u(id, email, first_name, role);

create temporary table ids on commit drop as
select
    (select id from public.sales where email = 'alice@alpha.test') as alice,
    (select id from public.sales where email = 'carla@alpha.test') as carla,
    (select id from public.sales where email = 'kim@alpha.test') as kim,
    (select id from public.sales where email = 'ken@alpha.test') as ken,
    (select id from public.sales where email = 'vera@alpha.test') as vera;
grant select on ids to authenticated;

-- Contacts 9001 and 9003 are Kim's, 9002 is Ken's, 9004 is unassigned.
insert into public.companies (id, name, organisation_id) values
    (9001, 'Alpha Housing Trust', 'a0000000-0000-0000-0000-000000000000');

insert into public.contacts (id, first_name, last_name, organisation_id, company_id, sales_id) values
    (9001, 'Kimsclient', 'One', 'a0000000-0000-0000-0000-000000000000', 9001, (select kim from ids)),
    (9002, 'Kensclient', 'Two', 'a0000000-0000-0000-0000-000000000000', 9001, (select ken from ids)),
    (9003, 'Kimsclient', 'Three', 'a0000000-0000-0000-0000-000000000000', 9001, (select kim from ids)),
    (9004, 'Nobodys', 'Four', 'a0000000-0000-0000-0000-000000000000', 9001, (select alice from ids));

insert into public.contact_notes (id, contact_id, text, organisation_id, sales_id) values
    (9001, 9001, 'Kim client note', 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9002, 9002, 'Ken client note', 'a0000000-0000-0000-0000-000000000000', (select ken from ids));

insert into public.tasks (id, contact_id, text, organisation_id, sales_id) values
    (9001, 9001, 'Kim client task', 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9002, 9002, 'Ken client task', 'a0000000-0000-0000-0000-000000000000', (select ken from ids));

insert into public.deals (id, name, stage, organisation_id, company_id, sales_id) values
    (9001, 'Kim deal', 'opportunity', 'a0000000-0000-0000-0000-000000000000', 9001, (select kim from ids)),
    (9002, 'Ken deal', 'opportunity', 'a0000000-0000-0000-0000-000000000000', 9001, (select ken from ids));

insert into public.deal_notes (id, deal_id, text, organisation_id, sales_id) values
    (9001, 9001, 'Kim deal note', 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9002, 9002, 'Ken deal note', 'a0000000-0000-0000-0000-000000000000', (select ken from ids));

insert into public.tags (id, name, color, organisation_id) values
    (9001, 'alpha-tag', '#eeeeee', 'a0000000-0000-0000-0000-000000000000');

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

-------------------------------------------------------------------------------
-- Roles live only in memberships
-------------------------------------------------------------------------------

select hasnt_column('public', 'sales', 'administrator', 'sales has no administrator column: memberships.role is the only source of roles');
select results_eq(
    $$select first_name, role::text from public.sales_summary order by first_name$$,
    $$values ('Alice', 'org_admin'), ('Carla', 'clinical_lead'), ('Ken', 'key_worker'), ('Kim', 'key_worker'), ('Vera', 'viewer')$$,
    'sales_summary: every staff profile with its role from memberships');

-------------------------------------------------------------------------------
-- Key worker (Kim)
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');

select results_eq($$select id from public.contacts order by id$$, $$values (9001::bigint), (9003::bigint)$$,
    'key worker: sees only the contacts assigned to them');
select results_eq($$select id from public.contacts_summary order by id$$, $$values (9001::bigint), (9003::bigint)$$,
    'key worker: contacts_summary shows only their contacts');
select results_eq($$select id from public.contact_notes$$, $$values (9001::bigint)$$,
    'key worker: sees only notes on their contacts');
select results_eq($$select id from public.tasks$$, $$values (9001::bigint)$$,
    'key worker: sees only tasks on their contacts');
select results_eq($$select id from public.deals$$, $$values (9001::bigint)$$,
    'key worker: sees only the deals assigned to them');
select results_eq($$select id from public.deal_notes$$, $$values (9001::bigint)$$,
    'key worker: sees only notes on their deals');
select is((select count(*) from public.global_search('Kensclient')), 0::bigint,
    'key worker: global_search does not find unassigned contacts');
select is((select count(*) from public.global_search('Kimsclient')), 2::bigint,
    'key worker: global_search finds their own contacts');
select is((select count(*) from public.activity_log where id like 'contact.9002.%' or id like 'contactNote.9002.%'), 0::bigint,
    'key worker: activity_log hides unassigned contacts and their notes');
select is((select count(*) from public.companies), 1::bigint,
    'key worker: sees the organisation''s companies');

-- Writes on their own records
update public.contacts set background = 'updated by Kim' where id = 9001;
select is((select background from public.contacts where id = 9001), 'updated by Kim',
    'key worker: can update an assigned contact');
insert into public.contact_notes (contact_id, text) values (9001, 'Kim adds a note');
select is((select count(*) from public.contact_notes where contact_id = 9001), 2::bigint,
    'key worker: can add a note to an assigned contact');
insert into public.tasks (contact_id, text) values (9001, 'Kim adds a task');
select is((select count(*) from public.tasks where contact_id = 9001), 2::bigint,
    'key worker: can add a task to an assigned contact');

-- Records assigned to someone else
with changed as (update public.contacts set background = 'hijacked' where id = 9002 returning 1)
select is((select count(*) from changed), 0::bigint, 'key worker: cannot update a contact assigned to someone else');
with changed as (update public.contact_notes set text = 'hijacked' where id = 9002 returning 1)
select is((select count(*) from changed), 0::bigint, 'key worker: cannot update a note on someone else''s contact');
with changed as (update public.deals set name = 'hijacked' where id = 9002 returning 1)
select is((select count(*) from changed), 0::bigint, 'key worker: cannot update a deal assigned to someone else');
with removed as (delete from public.tasks where id = 9002 returning 1)
select is((select count(*) from removed), 0::bigint, 'key worker: cannot delete a task on someone else''s contact');
select throws_ok($$insert into public.contact_notes (contact_id, text) values (9002, 'sneaky')$$, '42501', null,
    'key worker: cannot add a note to someone else''s contact');
select throws_ok($$insert into public.tasks (contact_id, text) values (9002, 'sneaky')$$, '42501', null,
    'key worker: cannot add a task to someone else''s contact');
select throws_ok($$insert into public.deal_notes (deal_id, text) values (9002, 'sneaky')$$, '42501', null,
    'key worker: cannot add a note to someone else''s deal');
select throws_ok($$update public.contact_notes set contact_id = 9002 where id = 9001$$, '42501', null,
    'key worker: cannot move a note onto someone else''s contact');

-- Assignment and lifecycle are for leads
select throws_ok(format('update public.contacts set sales_id = %s where id = 9001', (select ken from ids)), '42501', null,
    'key worker: cannot reassign their contact to someone else');
select throws_ok($$insert into public.contacts (first_name, last_name) values ('New', 'Person')$$, '42501', null,
    'key worker: cannot create contacts');
with removed as (delete from public.contacts where id = 9003 returning 1)
select is((select count(*) from removed), 0::bigint, 'key worker: cannot delete contacts, even their own');
select throws_ok($$select public.merge_contacts(9003, 9001)$$, '42501', null,
    'key worker: merge_contacts refuses instead of half-merging');
select results_eq($$select id from public.contacts order by id$$, $$values (9001::bigint), (9003::bigint)$$,
    'key worker: the refused merge left both contacts in place');

select ok(not public.is_admin(), 'key worker: is_admin is false');

-------------------------------------------------------------------------------
-- Second key worker (Ken) sees his own records and not Kim's
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e2');

select results_eq($$select id from public.contacts$$, $$values (9002::bigint)$$,
    'second key worker: sees only their own contact');
select is((select count(*) from public.contact_notes where contact_id = 9001), 0::bigint,
    'second key worker: cannot see notes Kim added to her contact');

-------------------------------------------------------------------------------
-- Viewer (Vera): no individual records
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000f1');

select is((select count(*) from public.contacts), 0::bigint, 'viewer: cannot read contacts');
select is((select count(*) from public.contacts_summary), 0::bigint, 'viewer: cannot read contacts_summary');
select is((select count(*) from public.contact_notes), 0::bigint, 'viewer: cannot read contact notes');
select is((select count(*) from public.tasks), 0::bigint, 'viewer: cannot read tasks');
select is((select count(*) from public.deals), 0::bigint, 'viewer: cannot read deals');
select is((select count(*) from public.deal_notes), 0::bigint, 'viewer: cannot read deal notes');
select is((select count(*) from public.companies), 0::bigint, 'viewer: cannot read companies');
select is((select count(*) from public.companies_summary), 0::bigint, 'viewer: cannot read companies_summary');
select is((select count(*) from public.activity_log), 0::bigint, 'viewer: activity_log is empty');
select is((select count(*) from public.global_search('client')), 0::bigint, 'viewer: global_search finds nothing');
select is((select count(*) from public.audit_log), 0::bigint, 'viewer: cannot read the audit log');
select throws_ok($$insert into public.contacts (first_name) values ('New')$$, '42501', null,
    'viewer: cannot create contacts');
select throws_ok($$insert into public.companies (name) values ('New')$$, '42501', null,
    'viewer: cannot create companies');
select throws_ok($$insert into public.tags (name, color) values ('new', '#000000')$$, '42501', null,
    'viewer: cannot create tags');
select throws_ok($$select public.log_record_view('contacts', 9001)$$, '42501', null,
    'viewer: cannot open (log a view of) an individual record');
select is((select count(*) from public.sales), 5::bigint, 'viewer: can read the staff list');
select is((select count(*) from public.tags), 1::bigint, 'viewer: can read tags');
select is((select count(*) from public.configuration), 1::bigint, 'viewer: can read the organisation configuration');
select is((select count(*) from public.organisations), 1::bigint, 'viewer: can read their organisation');

-------------------------------------------------------------------------------
-- Clinical lead (Carla): everything in the organisation, including assignments
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000c1');

select is((select count(*) from public.contacts), 4::bigint, 'clinical lead: sees every contact in the organisation');
select is((select count(*) from public.contact_notes), 3::bigint, 'clinical lead: sees every contact note');
select is((select count(*) from public.deals), 2::bigint, 'clinical lead: sees every deal');
update public.contacts set sales_id = (select ken from ids) where id = 9003;
select is((select sales_id from public.contacts where id = 9003), (select ken from ids),
    'clinical lead: can reassign a contact to another key worker');
insert into public.contacts (id, first_name, last_name, sales_id) values (9005, 'Brand', 'New', (select kim from ids));
select is((select count(*) from public.contacts where id = 9005), 1::bigint, 'clinical lead: can create a contact');
delete from public.contacts where id = 9004;
select is((select count(*) from public.contacts where id = 9004), 0::bigint, 'clinical lead: can delete a contact');
with changed as (update public.configuration set config = '{"title": "Lead"}' where id = 1 returning 1)
select is((select count(*) from changed), 0::bigint, 'clinical lead: cannot change organisation settings');
select ok(not public.is_admin(), 'clinical lead: is_admin is false');

-- Reassignment takes effect for the key workers straight away
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');
select results_eq($$select id from public.contacts order by id$$, $$values (9001::bigint), (9005::bigint)$$,
    'key worker: loses the contact reassigned away and gains the one assigned to them');
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e2');
select results_eq($$select id from public.contacts order by id$$, $$values (9002::bigint), (9003::bigint)$$,
    'second key worker: sees the contact reassigned to them');

-------------------------------------------------------------------------------
-- Org admin (Alice): everything, plus organisation settings
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');

select is((select count(*) from public.contacts), 4::bigint, 'org admin: sees every contact in the organisation');
select is((select count(*) from public.tasks), 3::bigint, 'org admin: sees every task');
update public.configuration set config = '{"title": "Admin"}' where id = 1;
select is((select config ->> 'title' from public.configuration), 'Admin', 'org admin: can change organisation settings');
select ok(public.is_admin(), 'org admin: is_admin is true');
select throws_ok($$update public.memberships set role = 'org_admin' where user_id = 'a0000000-0000-0000-0000-0000000000e1'$$,
    '42501', null, 'org admin: roles change only through the users edge function (service role), not directly');

-------------------------------------------------------------------------------
-- Helper functions
-------------------------------------------------------------------------------

select ok(private.can_access_assigned('a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    'can_access_assigned: an org admin can access a record assigned to anyone');
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');
select ok(private.can_access_assigned('a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    'can_access_assigned: a key worker can access their own record');
select ok(not private.can_access_assigned('a0000000-0000-0000-0000-000000000000', (select ken from ids)),
    'can_access_assigned: a key worker cannot access a colleague''s record');
select ok(not private.can_access_assigned('b0000000-0000-0000-0000-000000000000', (select kim from ids)),
    'can_access_assigned: nobody can access another organisation''s record');
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000f1');
select ok(not private.can_access_assigned('a0000000-0000-0000-0000-000000000000', (select vera from ids)),
    'can_access_assigned: a viewer cannot access a record even if it were assigned to them');
select pg_temp.sign_in('c0000000-0000-0000-0000-0000000000c1');
select ok(not private.sees_all_records() and not private.is_case_staff() and private.current_sales_id() is null,
    'helpers: a user with no membership gets no access');

select * from finish();
rollback;
