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

select plan(61);

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

-- Service user 9101 is Kim's, 9102 is Ken's. Profiles come from a trigger.
insert into public.service_users (id, display_name, reference_code, release_date, organisation_id, assigned_worker_id) values
    (9101, 'Kims Person', 'RE-90101', current_date - 5, 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9102, 'Kens Person', 'RE-90102', current_date - 5, 'a0000000-0000-0000-0000-000000000000', (select ken from ids));

insert into public.escalations (id, service_user_id, trigger_type, severity, organisation_id) values
    (9101, 9101, 'missed_checkins', 'medium', 'a0000000-0000-0000-0000-000000000000'),
    (9102, 9102, 'keyword', 'high', 'a0000000-0000-0000-0000-000000000000');

insert into public.activity_events (id, service_user_id, type, summary, organisation_id) values
    (9101, 9101, 'checkin', 'Kims person checked in', 'a0000000-0000-0000-0000-000000000000'),
    (9102, 9102, 'checkin', 'Kens person checked in', 'a0000000-0000-0000-0000-000000000000');

insert into public.case_notes (id, service_user_id, body, author_sales_id, organisation_id) values
    (9101, 9101, 'Kims note', (select kim from ids), 'a0000000-0000-0000-0000-000000000000'),
    (9102, 9102, 'Kens note', (select ken from ids), 'a0000000-0000-0000-0000-000000000000');

insert into public.case_actions (id, service_user_id, title, created_by, organisation_id) values
    (9101, 9101, 'Kims action', (select kim from ids), 'a0000000-0000-0000-0000-000000000000'),
    (9102, 9102, 'Kens action', (select ken from ids), 'a0000000-0000-0000-0000-000000000000');

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
    $$select first_name, role::text from public.sales_summary
      where organisation_id = 'a0000000-0000-0000-0000-000000000000' order by first_name$$,
    $$values ('Alice', 'org_admin'), ('Carla', 'clinical_lead'), ('Ken', 'key_worker'), ('Kim', 'key_worker'), ('Vera', 'viewer')$$,
    'sales_summary: every staff profile with its role from memberships');

-------------------------------------------------------------------------------
-- Organisation settings, staff list and admin rights
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');
select ok(not public.is_admin(), 'key worker: is_admin is false');

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000f1');
select is((select count(*) from public.audit_log), 0::bigint, 'viewer: cannot read the audit log');
select is((select count(*) from public.sales), 5::bigint, 'viewer: can read the staff list');
select is((select count(*) from public.configuration), 1::bigint, 'viewer: can read the organisation configuration');
select is((select count(*) from public.organisations), 1::bigint, 'viewer: can read their organisation');

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000c1');
with changed as (update public.configuration set config = '{"title": "Lead"}' where id = 1 returning 1)
select is((select count(*) from changed), 0::bigint, 'clinical lead: cannot change organisation settings');
select ok(not public.is_admin(), 'clinical lead: is_admin is false');

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.service_users), 2::bigint, 'org admin: sees every service user in the organisation');
update public.configuration set config = '{"title": "Admin"}' where id = 1;
select is((select config ->> 'title' from public.configuration), 'Admin', 'org admin: can change organisation settings');
select ok(public.is_admin(), 'org admin: is_admin is true');
select throws_ok($$update public.memberships set role = 'org_admin' where user_id = 'a0000000-0000-0000-0000-0000000000e1'$$,
    '42501', null, 'org admin: roles change only through the users edge function (service role), not directly');

-------------------------------------------------------------------------------
-- Service users, profiles, escalations and activity
-------------------------------------------------------------------------------

-- Key worker (Kim)
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');

select results_eq($$select id from public.service_users$$, $$values (9101::bigint)$$,
    'key worker: sees only the service users assigned to them');
select results_eq($$select id from public.service_users_summary$$, $$values (9101::bigint)$$,
    'key worker: the cohort view shows only their service users');
select results_eq($$select service_user_id from public.support_profiles$$, $$values (9101::bigint)$$,
    'key worker: sees only their service users'' profiles');
select results_eq($$select id from public.escalations$$, $$values (9101::bigint)$$,
    'key worker: sees only their service users'' escalations');
select results_eq($$select id from public.activity_events$$, $$values (9101::bigint)$$,
    'key worker: sees only their service users'' activity');

update public.support_profiles set active_cbt_module = 'urge_surfing' where service_user_id = 9101;
select results_eq(
    $$select active_cbt_module::text, version, updated_by from public.support_profiles where service_user_id = 9101$$,
    format($$values ('urge_surfing', 2, %s::bigint)$$, (select kim from ids)),
    'key worker: can configure an assigned person''s profile; the version goes up and records who changed it');
update public.escalations set status = 'acknowledged', notes = 'Called them back' where id = 9101;
select ok((select acknowledged_at is not null from public.escalations where id = 9101),
    'key worker: can acknowledge an escalation for their person (time stamped)');
insert into public.activity_events (service_user_id, type, summary) values (9101, 'logistics', 'Booked a housing appointment');
select is((select count(*) from public.activity_events where service_user_id = 9101), 2::bigint,
    'key worker: can record activity for their person');

with changed as (update public.support_profiles set keyword_sensitivity = 1 where service_user_id = 9102 returning 1)
select is((select count(*) from changed), 0::bigint, 'key worker: cannot change a colleague''s person''s profile');
with changed as (update public.escalations set status = 'resolved' where id = 9102 returning 1)
select is((select count(*) from changed), 0::bigint, 'key worker: cannot handle a colleague''s escalation');
select throws_ok($$insert into public.escalations (service_user_id, trigger_type, severity) values (9102, 'manual', 'low')$$, '42501', null,
    'key worker: cannot open an escalation for someone not assigned to them');
select throws_ok($$insert into public.activity_events (service_user_id, type, summary) values (9102, 'override', 'sneaky')$$, '42501', null,
    'key worker: cannot record activity for someone not assigned to them');
select throws_ok(format('update public.service_users set assigned_worker_id = %s where id = 9101', (select ken from ids)), '42501', null,
    'key worker: cannot reassign their person to someone else');
select throws_ok($$insert into public.service_users (display_name, reference_code, release_date) values ('New', 'RE-90199', current_date)$$, '42501', null,
    'key worker: cannot add service users');
with removed as (delete from public.escalations where id = 9101 returning 1)
select is((select count(*) from removed), 0::bigint, 'key worker: cannot delete escalations');
select throws_ok($$update public.activity_events set summary = 'rewritten' where id = 9101$$, '42501', null,
    'key worker: cannot rewrite the activity feed');
select throws_ok($$delete from public.activity_events where id = 9101$$, '42501', null,
    'key worker: cannot delete from the activity feed');

-- Case notes and actions (Kim)
select results_eq($$select id from public.case_notes$$, $$values (9101::bigint)$$,
    'key worker: sees only the case notes of their service users');
select results_eq($$select id from public.case_actions$$, $$values (9101::bigint)$$,
    'key worker: sees only the case actions of their service users');
insert into public.case_notes (id, service_user_id, body, author_sales_id) values (9103, 9101, 'Kim writes', (select ken from ids));
select is((select author_sales_id from public.case_notes where id = 9103), (select kim from ids),
    'key worker: a note they write is always in their name, whatever author is sent');
update public.case_notes set body = 'Kim edits' where id = 9103;
select is((select body from public.case_notes where id = 9103), 'Kim edits', 'key worker: can edit their own note');
update public.case_notes set author_sales_id = (select ken from ids), service_user_id = 9102 where id = 9103;
select results_eq($$select author_sales_id, service_user_id from public.case_notes where id = 9103$$,
    format($$values (%s::bigint, 9101::bigint)$$, (select kim from ids)),
    'key worker: editing a note cannot change its author or move it to another person');
select throws_ok($$insert into public.case_notes (service_user_id, body) values (9102, 'sneaky')$$, '42501', null,
    'key worker: cannot write a note about someone not assigned to them');
with removed as (delete from public.case_notes where id = 9103 returning 1)
select is((select count(*) from removed), 0::bigint, 'key worker: cannot delete notes, even their own');
insert into public.case_actions (id, service_user_id, title, due_date) values (9103, 9101, 'Book GP appointment', current_date + 2);
select is((select created_by from public.case_actions where id = 9103), (select kim from ids),
    'key worker: can add an action for their person, created in their name');
update public.case_actions set done_at = now() where id = 9103;
select ok((select done_at is not null from public.case_actions where id = 9103), 'key worker: can mark an action done');
with changed as (update public.case_actions set title = 'hijacked' where id = 9102 returning 1)
select is((select count(*) from changed), 0::bigint, 'key worker: cannot change a colleague''s person''s action');
select throws_ok($$insert into public.case_actions (service_user_id, title) values (9102, 'sneaky')$$, '42501', null,
    'key worker: cannot add an action for someone not assigned to them');
delete from public.case_actions where id = 9103;
select is((select count(*) from public.case_actions where id = 9103), 0::bigint, 'key worker: can delete an action they created');

-- Viewer (Vera)
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000f1');
select is(
    (select count(*) from public.service_users) + (select count(*) from public.service_users_summary)
      + (select count(*) from public.support_profiles) + (select count(*) from public.escalations)
      + (select count(*) from public.activity_events) + (select count(*) from public.case_notes)
      + (select count(*) from public.case_actions),
    0::bigint,
    'viewer: cannot read any service user, profile, escalation, activity event, case note or action');
select throws_ok($$insert into public.case_notes (service_user_id, body) values (9101, 'viewer note')$$, '42501', null,
    'viewer: cannot write case notes');
select throws_ok($$select public.log_record_view('service_users', 9101)$$, '42501', null,
    'viewer: cannot open a service user record');

-- Clinical lead (Carla)
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000c1');
select is((select count(*) from public.service_users), 2::bigint, 'clinical lead: sees every service user');
update public.service_users set assigned_worker_id = (select kim from ids) where id = 9102;
select is((select assigned_worker_id from public.service_users where id = 9102), (select kim from ids),
    'clinical lead: can reassign a service user');
insert into public.service_users (id, display_name, reference_code, release_date, assigned_worker_id)
    values (9103, 'New Person', 'RE-90103', current_date, (select ken from ids));
select is((select count(*) from public.support_profiles where service_user_id = 9103), 1::bigint,
    'clinical lead: can add a service user, who gets a default profile');
delete from public.escalations where id = 9102;
select is((select count(*) from public.escalations where id = 9102), 0::bigint, 'clinical lead: can delete an escalation');
select is((select count(*) from public.case_notes), 3::bigint, 'clinical lead: sees every case note');
with changed as (update public.case_notes set body = 'rewritten' where id = 9101 returning 1)
select is((select count(*) from changed), 0::bigint, 'clinical lead: cannot rewrite a colleague''s note');
delete from public.case_notes where id = 9102;
select is((select count(*) from public.case_notes where id = 9102), 0::bigint, 'clinical lead: can delete a note');
delete from public.case_actions where id = 9101;
select is((select count(*) from public.case_actions where id = 9101), 0::bigint, 'clinical lead: can delete any action');

-- After the reassignment, Kim sees both people and Ken only the new one
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');
select results_eq($$select id from public.service_users order by id$$, $$values (9101::bigint), (9102::bigint)$$,
    'key worker: gains the person reassigned to them');
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e2');
select results_eq($$select id from public.service_users order by id$$, $$values (9103::bigint)$$,
    'second key worker: loses the person reassigned away');

-------------------------------------------------------------------------------
-- Helper functions
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');
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
