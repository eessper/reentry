-- Audit log tests.
--
-- Proves that every insert, update and delete on an audited table writes an
-- audit_log row (from a trigger, so the app can't skip it), that record views
-- are logged through log_record_view(), that nobody can rewrite or remove
-- the log, and that each role reads only the part of the log it should.
--
-- Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(65);

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
    ('b0000000-0000-0000-0000-0000000000b1', 'bob@bravo.test', 'Bob', 'b0000000-0000-0000-0000-000000000000', 'org_admin')
) as u(id, email, first_name, organisation_id, role);

create temporary table ids on commit drop as
select
    (select id from public.sales where email = 'alice@alpha.test') as alice,
    (select id from public.sales where email = 'kim@alpha.test') as kim;
grant select on ids to authenticated;

insert into public.contacts (id, first_name, last_name, organisation_id, sales_id) values
    (9001, 'Kims', 'Client', 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9002, 'Alices', 'Client', 'a0000000-0000-0000-0000-000000000000', (select alice from ids));
insert into public.deals (id, name, stage, organisation_id, sales_id) values
    (9001, 'Fixture deal', 'opportunity', 'a0000000-0000-0000-0000-000000000000', (select alice from ids));
insert into public.service_users (id, display_name, reference_code, release_date, organisation_id, assigned_worker_id) values
    (9001, 'Kims Person', 'RE-90001', current_date - 2, 'a0000000-0000-0000-0000-000000000000', (select kim from ids)),
    (9002, 'Alices Person', 'RE-90002', current_date - 2, 'a0000000-0000-0000-0000-000000000000', (select alice from ids));

-- Profile ids, read here as the owner so tests can name profiles a user can't see
create temporary table profile_ids on commit drop as
select service_user_id, id from public.support_profiles where service_user_id in (9001, 9002);
grant select on profile_ids to authenticated;

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

-- Creates, updates and deletes one row of `tbl` as the signed-in user, then
-- checks the three audit rows it must have produced (3 checks).
-- `insert_sql` must end with `returning id`; `update_sql` takes the id as %s.
create function pg_temp.check_audit(tbl text, insert_sql text, update_sql text)
returns setof text
language plpgsql
as $$
declare
  new_id bigint;
  actor uuid := auth.uid();
begin
  execute insert_sql into new_id;
  execute format(update_sql, new_id);
  execute format('delete from public.%I where id = %s', tbl, new_id);

  return next ok(exists (
      select 1 from public.audit_log
      where table_name = tbl and record_id = new_id::text and action = 'create'
        and actor_user_id = actor and organisation_id = 'a0000000-0000-0000-0000-000000000000'
        and before is null and (after ->> 'id')::bigint = new_id
    ), tbl || ': insert is logged as create, with the new row, actor and organisation');
  return next ok(exists (
      select 1 from public.audit_log
      where table_name = tbl and record_id = new_id::text and action = 'update'
        and actor_user_id = actor and before is not null and after is not null and before <> after
    ), tbl || ': update is logged with the row before and after');
  return next ok(exists (
      select 1 from public.audit_log
      where table_name = tbl and record_id = new_id::text and action = 'delete'
        and actor_user_id = actor and before is not null and after is null
    ), tbl || ': delete is logged with the deleted row');
end;
$$;

-------------------------------------------------------------------------------
-- Every insert, update and delete is logged (as Alice, org admin)
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');

select * from pg_temp.check_audit('companies',
    $$insert into public.companies (name) values ('Audited company') returning id$$,
    $$update public.companies set name = 'Renamed company' where id = %s$$);
select * from pg_temp.check_audit('contacts',
    $$insert into public.contacts (first_name, last_name) values ('Audited', 'Contact') returning id$$,
    $$update public.contacts set background = 'changed' where id = %s$$);
select * from pg_temp.check_audit('contact_notes',
    $$insert into public.contact_notes (contact_id, text) values (9001, 'Audited note') returning id$$,
    $$update public.contact_notes set text = 'changed' where id = %s$$);
select * from pg_temp.check_audit('tasks',
    $$insert into public.tasks (contact_id, text) values (9001, 'Audited task') returning id$$,
    $$update public.tasks set text = 'changed' where id = %s$$);
select * from pg_temp.check_audit('deals',
    $$insert into public.deals (name, stage) values ('Audited deal', 'opportunity') returning id$$,
    $$update public.deals set name = 'changed' where id = %s$$);
select * from pg_temp.check_audit('deal_notes',
    $$insert into public.deal_notes (deal_id, text) values (9001, 'Audited deal note') returning id$$,
    $$update public.deal_notes set text = 'changed' where id = %s$$);
select * from pg_temp.check_audit('tags',
    $$insert into public.tags (name, color) values ('audited', '#000000') returning id$$,
    $$update public.tags set color = '#ffffff' where id = %s$$);

select * from pg_temp.check_audit('service_users',
    $$insert into public.service_users (display_name, reference_code, release_date) values ('Audited Person', 'RE-90050', current_date) returning id$$,
    $$update public.service_users set risk_tier = 'high' where id = %s$$);
select * from pg_temp.check_audit('escalations',
    $$insert into public.escalations (service_user_id, trigger_type, severity) values (9002, 'manual', 'low') returning id$$,
    $$update public.escalations set status = 'acknowledged' where id = %s$$);

-- Support profiles are created by a trigger and then configured
insert into public.service_users (id, display_name, reference_code, release_date) values (9060, 'Profiled Person', 'RE-90060', current_date);
update public.support_profiles set primary_risk_pathway = 'housing_instability' where service_user_id = 9060;
select ok(exists (
    select 1 from public.audit_log
    where table_name = 'support_profiles' and action = 'create' and (after ->> 'service_user_id')::bigint = 9060
      and actor_user_id = 'a0000000-0000-0000-0000-0000000000a1'
  ), 'support_profiles: the profile created with a service user is logged, with the person who created it');
select ok(exists (
    select 1 from public.audit_log
    where table_name = 'support_profiles' and action = 'update' and (after ->> 'service_user_id')::bigint = 9060
      and before ->> 'primary_risk_pathway' is null and after ->> 'primary_risk_pathway' = 'housing_instability'
      and (after ->> 'version')::int = 2
  ), 'support_profiles: configuration changes are logged with before, after and the new version');

insert into public.activity_events (service_user_id, type, summary) values (9002, 'checkin', 'Audited check-in');
select ok(exists (
    select 1 from public.audit_log
    where table_name = 'activity_events' and action = 'create' and after ->> 'summary' = 'Audited check-in'
  ), 'activity_events: new events are logged');

update public.configuration set config = '{"title": "Audited"}' where id = 1;
select ok(exists (
    select 1 from public.audit_log
    where table_name = 'configuration' and action = 'update'
      and before -> 'config' ->> 'title' is null and after -> 'config' ->> 'title' = 'Audited'
  ), 'configuration: settings changes are logged with before and after');

select ok(not exists (select 1 from public.audit_log where before ? 'fts' or after ? 'fts'),
    'the generated search column is left out of logged rows');

-- Cascades are logged too
insert into public.contacts (id, first_name) values (9050, 'Cascade');
insert into public.contact_notes (id, contact_id, text) values (9050, 9050, 'Goes with its contact');
delete from public.contacts where id = 9050;
select ok(exists (
    select 1 from public.audit_log where table_name = 'contact_notes' and record_id = '9050' and action = 'delete'
  ), 'a note deleted by cascade with its contact is logged');

-------------------------------------------------------------------------------
-- Changes made by the system (service role, triggers) are logged too
-------------------------------------------------------------------------------

reset role;
select results_eq(
    $$select table_name, action::text, actor_user_id is null
      from public.audit_log
      where organisation_id = 'b0000000-0000-0000-0000-000000000000' and action = 'create'
      order by id$$,
    $$values ('organisations', 'create', true), ('configuration', 'create', true),
             ('memberships', 'create', true), ('sales', 'create', true)$$,
    'creating an organisation and its first user logs the organisation, its configuration, the membership and the staff profile');

update public.memberships set role = 'clinical_lead' where user_id = 'a0000000-0000-0000-0000-0000000000e1';
select ok(exists (
    select 1 from public.audit_log
    where table_name = 'memberships' and action = 'update'
      and before ->> 'role' = 'key_worker' and after ->> 'role' = 'clinical_lead'
  ), 'role changes are logged with the old and new role');
update public.memberships set role = 'key_worker' where user_id = 'a0000000-0000-0000-0000-0000000000e1';

-------------------------------------------------------------------------------
-- Record views
-------------------------------------------------------------------------------

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');

select lives_ok($$select public.log_record_view('contacts', 9001)$$, 'key worker: can log a view of an assigned contact');
select lives_ok($$select public.log_record_view('service_users', 9001)$$, 'key worker: can log a view of an assigned service user');
select lives_ok(
    format($$select public.log_record_view('support_profiles', %s)$$, (select id from profile_ids where service_user_id = 9001)),
    'key worker: can log a view of an assigned service user''s profile');
select throws_ok($$select public.log_record_view('service_users', 9002)$$, '42501', null,
    'key worker: cannot log a view of a service user not assigned to them');
select throws_ok(
    format($$select public.log_record_view('support_profiles', %s)$$, (select id from profile_ids where service_user_id = 9002)),
    '42501', null,
    'key worker: cannot log a view of a colleague''s profile, even by guessing its id');
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');
select results_eq(
    $$select organisation_id, actor_user_id, before is null and after is null from public.audit_log
      where action = 'view' and table_name = 'contacts' and record_id = '9001'$$,
    $$values ('a0000000-0000-0000-0000-000000000000'::uuid, 'a0000000-0000-0000-0000-0000000000e1'::uuid, true)$$,
    'a view is logged with the record, the viewer and the organisation');

select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');
select throws_ok($$select public.log_record_view('contacts', 9002)$$, '42501', null,
    'key worker: cannot log a view of a contact not assigned to them');
select throws_ok($$select public.log_record_view('contacts', 999999)$$, '42501', null,
    'a missing record gives the same error as a hidden one');
select throws_ok($$select public.log_record_view('companies', 1)$$, '22023', null,
    'only supported tables can be logged as viewed');

select pg_temp.sign_in('b0000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.log_record_view('contacts', 9001)$$, '42501', null,
    'another organisation''s admin cannot log a view of an Alpha contact');

-------------------------------------------------------------------------------
-- Who reads the log
-------------------------------------------------------------------------------

-- Bob (Bravo admin)
select is((select count(*) from public.audit_log where organisation_id = 'a0000000-0000-0000-0000-000000000000'), 0::bigint,
    'another organisation''s admin cannot read Alpha''s audit log');
select ok((select count(*) from public.audit_log) > 0, 'an org admin reads their own organisation''s log');

-- Kim (key worker)
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000e1');
select ok(exists (select 1 from public.audit_log where table_name = 'contacts' and record_id = '9001'),
    'key worker: reads the history of an assigned contact');
select is((select count(*) from public.audit_log where table_name = 'contacts' and record_id = '9002'), 0::bigint,
    'key worker: cannot read the history of a contact not assigned to them');
select ok(exists (select 1 from public.audit_log where table_name = 'service_users' and record_id = '9001' and action = 'view'),
    'key worker: reads the history of an assigned service user');
select ok(exists (select 1 from public.audit_log where table_name = 'support_profiles' and action = 'create'),
    'key worker: reads the history of their service user''s profile');
select is((select count(*) from public.audit_log where table_name = 'service_users' and record_id = '9002'), 0::bigint,
    'key worker: cannot read the history of a service user not assigned to them');
select is((select count(*) from public.audit_log where table_name not in ('contacts', 'service_users', 'support_profiles', 'escalations')), 0::bigint,
    'key worker: cannot read the rest of the organisation''s log');

-------------------------------------------------------------------------------
-- Append-only
-------------------------------------------------------------------------------

-- As an app user (Alice, org admin)
select pg_temp.sign_in('a0000000-0000-0000-0000-0000000000a1');
select throws_ok($$update public.audit_log set action = 'view'$$, '42501', null, 'authenticated: cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'authenticated: cannot delete from audit_log');
select throws_ok(
    $$insert into public.audit_log (organisation_id, action, table_name, record_id)
      values ('a0000000-0000-0000-0000-000000000000', 'view', 'contacts', '9002')$$,
    '42501', null, 'authenticated: cannot write audit_log rows directly');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'authenticated: cannot truncate audit_log');

-- As anon
reset role;
set local role anon;
select throws_ok($$select count(*) from public.audit_log$$, '42501', null, 'anon: cannot read audit_log');

-- As the service role (bypasses RLS)
reset role;
set local role service_role;
select throws_ok($$update public.audit_log set action = 'view'$$, '42501', null, 'service_role: cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'service_role: cannot delete from audit_log');
select throws_ok(
    $$insert into public.audit_log (organisation_id, action, table_name, record_id)
      values ('a0000000-0000-0000-0000-000000000000', 'view', 'contacts', '9002')$$,
    '42501', null, 'service_role: cannot write audit_log rows directly');
select throws_ok($$truncate public.audit_log$$, '42501', null, 'service_role: cannot truncate audit_log');

-- Even the table owner is stopped by the append-only triggers
reset role;
select throws_ok($$update public.audit_log set action = 'view'$$, '42501', 'audit_log is append-only',
    'owner: updates are refused by the append-only trigger');
select throws_ok($$delete from public.audit_log$$, '42501', 'audit_log is append-only',
    'owner: deletes are refused by the append-only trigger');
select throws_ok($$truncate public.audit_log$$, '42501', 'audit_log is append-only',
    'owner: truncate is refused by the append-only trigger');

select * from finish();
rollback;
